/**
 * Engine
 *
 * WebGPU-only cellular-automata engine. Owns the GPU device, a double-buffered
 * (ping-pong) cell grid stored in two storage buffers, a compute pipeline built
 * from the active Automaton, and a fullscreen render pipeline that colorizes the
 * grid. A requestAnimationFrame loop advances the simulation at a configurable
 * steps-per-second rate (decoupled from the 60fps render) and renders every frame
 * so camera pan/zoom stay live even when paused.
 *
 * Rebuild vs realtime:
 *  - changing the automaton, grid size, or channel count reallocates buffers and
 *    rebuilds pipelines (initialize()/setAutomaton()/resize())
 *  - tweaking an automaton param is a Params uniform write (realtime, no rebuild)
 */

import { View, type ViewSnapshot } from "./view";
import { Automaton } from "./automaton";
import {
  buildCompute,
  packParams,
  SIM_UNIFORM_SIZE,
  type BuiltCompute,
} from "./webgpu/build-compute";
import {
  renderWGSL,
  packRenderUniform,
  RENDER_UNIFORM_SIZE,
} from "./webgpu/build-render";

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface RenderConfig {
  /** 0 = single-channel binary (colorOff/colorOn), 1 = channels->RGBA. Auto by channels if undefined. */
  colorMode?: number;
  colorOff: RGBA;
  colorOn: RGBA;
  colorBg: RGBA;
  showGrid: boolean;
  /** Zoom (px/cell) at/above which grid lines appear. */
  gridThreshold: number;
}

/** How randomize() distributes values across a cell's channels. */
export type RandomizeMode = "first" | "all" | "independent";

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  automaton: Automaton;
  grid?: { width?: number; height?: number; wrap?: boolean; maxCells?: number };
  stepsPerSecond?: number;
  render?: Partial<RenderConfig>;
}

const DEFAULT_RENDER: RenderConfig = {
  colorOff: { r: 0.05, g: 0.05, b: 0.07, a: 1 },
  colorOn: { r: 0.78, g: 0.85, b: 1.0, a: 1 },
  colorBg: { r: 0.02, g: 0.02, b: 0.03, a: 1 },
  showGrid: false,
  gridThreshold: 8,
};

// Backlog cap per rAF frame: at 60fps this bounds the top simulation rate
// (64 * 60 ≈ 3840 steps/s) and keeps a heavy automaton from death-spiraling —
// when the cap is hit the accumulator resets and the backlog is dropped.
const MAX_STEPS_PER_FRAME = 64;

export class Engine {
  private canvas: HTMLCanvasElement;
  private automaton: Automaton;
  private view: View;

  // grid config
  private gridW: number;
  private gridH: number;
  private wrap: boolean;
  private channels = 1;
  /** Per-dimension cap for ensureGridCovers() growth; also bounds min zoom. */
  private maxCells: number;
  /** When true, the min zoom is the grid-covers-viewport zoom (no zoom-out growth). */
  private coverMinZoom = false;

  private stepsPerSecond: number;
  private renderConfig: RenderConfig;

  // GPU
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;

  private simBuffer!: GPUBuffer;
  private renderUniform!: GPUBuffer;
  private paramsBuffer: GPUBuffer | null = null;
  private storageBuffers = new Map<string, GPUBuffer>();
  private cellBuffers: [GPUBuffer, GPUBuffer] | null = null;
  private current = 0; // index of buffer holding the latest state

  private computePipeline!: GPUComputePipeline;
  private renderPipeline!: GPURenderPipeline;
  private computeBind: [GPUBindGroup, GPUBindGroup] | null = null;
  private renderBind: [GPUBindGroup, GPUBindGroup] | null = null;

  private built: BuiltCompute | null = null;
  private advancesRowFlag = false;

  // loop
  private playing = false;
  private rafId: number | null = null;
  private lastTime = 0;
  private accum = 0;
  private fps = 0;
  private frame = 0;
  private rowCounter = 0;
  private initialized = false;

  constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    this.automaton = options.automaton;
    this.gridW = Math.max(1, Math.floor(options.grid?.width ?? 256));
    this.gridH = Math.max(1, Math.floor(options.grid?.height ?? 256));
    this.wrap = options.grid?.wrap ?? true;
    this.maxCells = Math.max(16, Math.floor(options.grid?.maxCells ?? 1024));
    this.stepsPerSecond = options.stepsPerSecond ?? 20;
    this.renderConfig = { ...DEFAULT_RENDER, ...options.render };
    this.view = new View(this.canvas.clientWidth || 800, this.canvas.clientHeight || 600);
  }

  // ---- lifecycle ------------------------------------------------------------

  async initialize(): Promise<void> {
    if (!("gpu" in navigator) || !navigator.gpu) {
      throw new Error("WebGPU is not available in this browser.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter found.");
    this.device = await adapter.requestDevice();

    const ctx = this.canvas.getContext("webgpu");
    if (!ctx) throw new Error("Could not create a WebGPU canvas context.");
    this.context = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque",
    });

    this.simBuffer = this.device.createBuffer({
      size: SIM_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.renderUniform = this.device.createBuffer({
      size: RENDER_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Static render pipeline (bind group references cell buffers, rebuilt per rebuild()).
    const renderModule = this.device.createShaderModule({ code: renderWGSL });
    this.renderPipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: { module: renderModule, entryPoint: "vs" },
      fragment: {
        module: renderModule,
        entryPoint: "fs",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-strip" },
    });

    this.automaton.attach(
      (name) => this.flushParam(name),
      () => this.rebuild()
    );

    this.resizeCanvas();
    this.rebuild();
    this.initialized = true;
    this.startLoop();
  }

  destroy(): void {
    this.stopLoop();
    this.automaton.detach();
    this.cellBuffers?.forEach((b) => b.destroy());
    this.paramsBuffer?.destroy();
    this.storageBuffers.forEach((b) => b.destroy());
    this.simBuffer?.destroy();
    this.renderUniform?.destroy();
    this.device?.destroy?.();
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ---- (re)build automaton-dependent GPU resources --------------------------

  private rebuild(): void {
    if (!this.device) return;
    const desc = this.automaton.build();
    const built = buildCompute(desc);
    this.built = built;
    this.advancesRowFlag = desc.advancesRow === true;

    const prevChannels = this.channels;
    this.channels = desc.channels;

    // Cell buffers (reallocate if channels/size changed or first build).
    const cellFloats = this.gridW * this.gridH * this.channels;
    const cellBytes = cellFloats * 4;
    if (!this.cellBuffers || prevChannels !== this.channels) {
      this.cellBuffers?.forEach((b) => b.destroy());
      const usage =
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
      this.cellBuffers = [
        this.device.createBuffer({ size: cellBytes, usage }),
        this.device.createBuffer({ size: cellBytes, usage }),
      ];
      this.current = 0;
      // Zero-initialize.
      const zero = new Float32Array(cellFloats);
      this.device.queue.writeBuffer(this.cellBuffers[0], 0, zero);
      this.device.queue.writeBuffer(this.cellBuffers[1], 0, zero);
    }

    // Params uniform.
    this.paramsBuffer?.destroy();
    this.paramsBuffer = null;
    if (built.paramsSize > 0) {
      this.paramsBuffer = this.device.createBuffer({
        size: built.paramsSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(
        this.paramsBuffer,
        0,
        packParams(desc.params, this.automaton.getValues())
      );
    }

    // Storage buffers (e.g. neural weights).
    this.storageBuffers.forEach((b) => b.destroy());
    this.storageBuffers.clear();
    for (const s of desc.storages ?? []) {
      const buf = this.device.createBuffer({
        size: Math.max(4, s.data.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(buf, 0, s.data);
      this.storageBuffers.set(s.name, buf);
    }

    // Compute pipeline.
    const module = this.device.createShaderModule({ code: built.code });
    this.computePipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "step" },
    });

    this.rebuildBindGroups();
  }

  private rebuildBindGroups(): void {
    if (!this.cellBuffers || !this.built) return;
    const [a, b] = this.cellBuffers;

    const computeEntries = (src: GPUBuffer, dst: GPUBuffer): GPUBindGroupEntry[] => {
      const entries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: this.simBuffer } },
        { binding: 1, resource: { buffer: src } },
        { binding: 2, resource: { buffer: dst } },
      ];
      if (this.paramsBuffer && this.built!.paramsBinding >= 0) {
        entries.push({
          binding: this.built!.paramsBinding,
          resource: { buffer: this.paramsBuffer },
        });
      }
      for (const [name, binding] of Object.entries(this.built!.storageBindings)) {
        const buf = this.storageBuffers.get(name)!;
        entries.push({ binding, resource: { buffer: buf } });
      }
      return entries;
    };

    const layout = this.computePipeline.getBindGroupLayout(0);
    this.computeBind = [
      this.device.createBindGroup({ layout, entries: computeEntries(a, b) }),
      this.device.createBindGroup({ layout, entries: computeEntries(b, a) }),
    ];

    const rLayout = this.renderPipeline.getBindGroupLayout(0);
    const renderEntries = (cells: GPUBuffer): GPUBindGroupEntry[] => [
      { binding: 0, resource: { buffer: this.renderUniform } },
      { binding: 1, resource: { buffer: cells } },
    ];
    this.renderBind = [
      this.device.createBindGroup({ layout: rLayout, entries: renderEntries(a) }),
      this.device.createBindGroup({ layout: rLayout, entries: renderEntries(b) }),
    ];
  }

  private flushParam(_name: string): void {
    if (!this.device || !this.paramsBuffer || !this.built) return;
    const desc = this.automaton.build();
    this.device.queue.writeBuffer(
      this.paramsBuffer,
      0,
      packParams(desc.params, this.automaton.getValues())
    );
  }

  // ---- automaton / grid config ----------------------------------------------

  setAutomaton(automaton: Automaton): void {
    this.automaton.detach();
    this.automaton = automaton;
    this.rowCounter = 0;
    this.frame = 0;
    if (this.device) {
      this.automaton.attach(
        (name) => this.flushParam(name),
        () => this.rebuild()
      );
      this.rebuild();
    }
  }

  getAutomaton(): Automaton {
    return this.automaton;
  }

  /** Update a named storage buffer in place (e.g. neural reseed) without a rebuild. */
  updateStorage(name: string, data: Float32Array): void {
    const buf = this.storageBuffers.get(name);
    if (buf && this.device) this.device.queue.writeBuffer(buf, 0, data);
  }

  resize(width: number, height: number): void {
    this.gridW = Math.max(1, Math.floor(width));
    this.gridH = Math.max(1, Math.floor(height));
    this.updateZoomLimits();
    this.rowCounter = 0;
    if (this.device && this.cellBuffers) {
      this.cellBuffers.forEach((b) => b.destroy());
      this.cellBuffers = null; // force reallocation
      this.rebuild();
    }
  }

  /**
   * Grow the grid (never shrink) so it covers the viewport at the current
   * zoom, keeping existing cell contents in place, then clamp the camera so
   * the view stays inside the grid. Growth reallocates the cell buffers with
   * a GPU-side region copy — the compute pipeline is untouched, so there is
   * no shader recompile and no state reset. Call after zoom/pan/canvas-size
   * changes.
   */
  ensureGridCovers(): void {
    if (!this.device || !this.cellBuffers) return;
    const { width: vw, height: vh } = this.view.getSize();
    const zoom = this.view.getZoom();
    const needW = Math.min(this.maxCells, Math.ceil(vw / zoom));
    const needH = Math.min(this.maxCells, Math.ceil(vh / zoom));
    if (needW > this.gridW || needH > this.gridH) {
      // Grow in chunks so continuous wheel zoom doesn't reallocate every tick.
      const CHUNK = 64;
      const round = (n: number) =>
        Math.min(this.maxCells, Math.ceil(n / CHUNK) * CHUNK);
      const newW = needW > this.gridW ? round(needW) : this.gridW;
      const newH = needH > this.gridH ? round(needH) : this.gridH;
      const offX = Math.floor((newW - this.gridW) / 2);
      const offY = Math.floor((newH - this.gridH) / 2);
      this.reallocPreserving(newW, newH, offX, offY);
      // Cells moved by (offX, offY) in world space; follow them so the view
      // doesn't jump.
      const cam = this.view.getCamera();
      this.view.setCamera(cam.x + offX, cam.y + offY);
    }
    this.clampCamera();
  }

  /** Keep the visible world rect inside the grid (centered if the grid is smaller). */
  private clampCamera(): void {
    const { width: vw, height: vh } = this.view.getSize();
    const zoom = this.view.getZoom();
    const halfW = vw / (2 * zoom);
    const halfH = vh / (2 * zoom);
    const cam = this.view.getCamera();
    const cx =
      this.gridW <= halfW * 2
        ? this.gridW / 2
        : Math.min(Math.max(cam.x, halfW), this.gridW - halfW);
    const cy =
      this.gridH <= halfH * 2
        ? this.gridH / 2
        : Math.min(Math.max(cam.y, halfH), this.gridH - halfH);
    if (cx !== cam.x || cy !== cam.y) this.view.setCamera(cx, cy);
  }

  /**
   * Reallocate the cell buffers at a new size, copying the current grid into
   * the region at (offX, offY). WebGPU zero-initializes the new buffers, so
   * cells outside the copied region start empty. Pipelines are reused; only
   * bind groups are rebuilt.
   */
  private reallocPreserving(
    newW: number,
    newH: number,
    offX: number,
    offY: number
  ): void {
    if (!this.device || !this.cellBuffers) return;
    const bpc = this.channels * 4; // bytes per cell
    const usage =
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    const size = newW * newH * bpc;
    const next: [GPUBuffer, GPUBuffer] = [
      this.device.createBuffer({ size, usage }),
      this.device.createBuffer({ size, usage }),
    ];

    const src = this.cellBuffers[this.current];
    const encoder = this.device.createCommandEncoder();
    const rowBytes = this.gridW * bpc;
    for (let y = 0; y < this.gridH; y++) {
      encoder.copyBufferToBuffer(
        src,
        y * this.gridW * bpc,
        next[0],
        ((y + offY) * newW + offX) * bpc,
        rowBytes
      );
    }
    this.device.queue.submit([encoder.finish()]);

    this.cellBuffers.forEach((b) => b.destroy());
    this.cellBuffers = next;
    this.current = 0;
    this.gridW = newW;
    this.gridH = newH;
    this.updateZoomLimits();
    this.rebuildBindGroups();
  }

  getGridSize(): { width: number; height: number } {
    return { width: this.gridW, height: this.gridH };
  }

  getChannels(): number {
    return this.channels;
  }

  setWrap(wrap: boolean): void {
    this.wrap = wrap;
  }

  getWrap(): boolean {
    return this.wrap;
  }

  // ---- state manipulation ---------------------------------------------------

  private latest(): GPUBuffer {
    return this.cellBuffers![this.current];
  }

  clear(): void {
    if (!this.cellBuffers) return;
    const zero = new Float32Array(this.gridW * this.gridH * this.channels);
    this.device.queue.writeBuffer(this.latest(), 0, zero);
    this.rowCounter = 0;
  }

  /** Upload a full grid state (length must be gridW*gridH*channels). */
  setCells(data: Float32Array): void {
    if (!this.cellBuffers) return;
    this.device.queue.writeBuffer(this.latest(), 0, data);
  }

  /**
   * Randomize the grid; `density` is the per-cell probability of being set.
   *
   *  "first"       only channel 0 is set (binary automata)
   *  "all"         a chosen cell has every channel set to 1 (a coherent live seed)
   *  "independent" every channel is sampled separately (per-channel noise)
   */
  randomize(density = 0.3, mode: RandomizeMode = "first"): void {
    const cells = this.gridW * this.gridH;
    const data = new Float32Array(cells * this.channels);
    for (let i = 0; i < cells; i++) {
      const base = i * this.channels;
      if (mode === "independent") {
        for (let c = 0; c < this.channels; c++) {
          data[base + c] = Math.random() < density ? 1 : 0;
        }
      } else if (mode === "all") {
        if (Math.random() < density) {
          for (let c = 0; c < this.channels; c++) data[base + c] = 1;
        }
      } else {
        data[base] = Math.random() < density ? 1 : 0;
      }
    }
    this.setCells(data);
    this.rowCounter = 0;
  }

  /** Set a single cell's channels (missing channels set to `fill`). */
  setCell(x: number, y: number, values: number[], fill = 0): void {
    if (!this.cellBuffers) return;
    if (x < 0 || y < 0 || x >= this.gridW || y >= this.gridH) return;
    const arr = new Float32Array(this.channels);
    for (let c = 0; c < this.channels; c++) arr[c] = values[c] ?? fill;
    const offset = (y * this.gridW + x) * this.channels * 4;
    this.device.queue.writeBuffer(this.latest(), offset, arr);
  }

  /** Set all channels of a cell to 1 (a "live seed"). */
  seedPoint(x: number, y: number): void {
    this.setCell(x, y, new Array(this.channels).fill(1));
  }

  /** Read the current grid state back to the CPU. */
  async getCells(): Promise<Float32Array> {
    if (!this.cellBuffers) return new Float32Array(0);
    const floats = this.gridW * this.gridH * this.channels;
    const bytes = floats * 4;
    const staging = this.device.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.latest(), 0, staging, 0, bytes);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const copy = new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();
    return copy;
  }

  // ---- simulation loop ------------------------------------------------------

  play(): void {
    this.playing = true;
    this.accum = 0;
  }

  pause(): void {
    this.playing = false;
  }

  toggle(): void {
    this.playing ? this.pause() : this.play();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  stop(): void {
    this.pause();
  }

  setStepsPerSecond(n: number): void {
    this.stepsPerSecond = Math.max(0.1, n);
  }

  getStepsPerSecond(): number {
    return this.stepsPerSecond;
  }

  getFPS(): number {
    return this.fps;
  }

  getFrame(): number {
    return this.frame;
  }

  /** Advance the simulation by exactly one generation. */
  step(): void {
    if (!this.device || !this.computeBind || !this.cellBuffers) return;

    const currentRow = this.advancesRowFlag
      ? (this.rowCounter % Math.max(1, this.gridH - 1)) + 1
      : 0;

    // Write the shared Sim uniform for this step.
    const sim = new Uint32Array(8);
    sim[0] = this.gridW;
    sim[1] = this.gridH;
    sim[2] = this.channels;
    sim[3] = this.wrap ? 1 : 0;
    sim[4] = currentRow;
    sim[5] = this.frame >>> 0;
    sim[6] = (Math.imul(this.frame + 1, 2654435761) >>> 0) >>> 0;
    sim[7] = 0;
    this.device.queue.writeBuffer(this.simBuffer, 0, sim);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.computePipeline);
    pass.setBindGroup(0, this.computeBind[this.current]);
    pass.dispatchWorkgroups(
      Math.ceil(this.gridW / 8),
      Math.ceil(this.gridH / 8),
      1
    );
    pass.end();
    this.device.queue.submit([encoder.finish()]);

    this.current = 1 - this.current;
    this.frame++;
    this.rowCounter++;
  }

  private startLoop(): void {
    if (this.rafId != null) return;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.animate);
  }

  private stopLoop(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private animate = (now: number): void => {
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.fps = this.fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1;

    if (this.playing) {
      this.accum += dt;
      const interval = 1 / this.stepsPerSecond;
      let steps = 0;
      while (this.accum >= interval && steps < MAX_STEPS_PER_FRAME) {
        this.step();
        this.accum -= interval;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accum = 0;
    }

    this.render();
    this.rafId = requestAnimationFrame(this.animate);
  };

  private render(): void {
    if (!this.device || !this.renderBind) return;
    const snap = this.view.getSnapshot();
    const rc = this.renderConfig;
    const colorMode =
      rc.colorMode ?? (this.channels > 1 ? 1 : 0);
    const toArr = (c: RGBA): [number, number, number, number] => [c.r, c.g, c.b, c.a];

    this.device.queue.writeBuffer(
      this.renderUniform,
      0,
      packRenderUniform({
        width: snap.width,
        height: snap.height,
        cameraX: snap.cx,
        cameraY: snap.cy,
        zoom: snap.zoom,
        gridW: this.gridW,
        gridH: this.gridH,
        channels: this.channels,
        colorMode,
        showGrid: rc.showGrid ? 1 : 0,
        gridThreshold: rc.gridThreshold,
        dpr: this.dpr(),
        colorOff: toArr(rc.colorOff),
        colorOn: toArr(rc.colorOn),
        colorBg: toArr(rc.colorBg),
      })
    );

    const encoder = this.device.createCommandEncoder();
    const view = this.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: {
            r: rc.colorBg.r,
            g: rc.colorBg.g,
            b: rc.colorBg.b,
            a: rc.colorBg.a,
          },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderBind[this.current]);
    pass.draw(4);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  // ---- view / canvas --------------------------------------------------------

  private dpr(): number {
    return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  }

  private resizeCanvas(): void {
    const cssW = this.canvas.clientWidth || this.view.getSize().width;
    const cssH = this.canvas.clientHeight || this.view.getSize().height;
    const dpr = this.dpr();
    this.canvas.width = Math.max(1, Math.floor(cssW * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssH * dpr));
    this.view.setSize(cssW, cssH);
    this.updateZoomLimits();
  }

  /** Notify the engine the canvas CSS size changed. */
  setSize(cssWidth: number, cssHeight: number): void {
    const dpr = this.dpr();
    const w = Math.max(1, Math.floor(cssWidth * dpr));
    const h = Math.max(1, Math.floor(cssHeight * dpr));
    // Assigning canvas.width/height clears the canvas even for equal values,
    // so skip no-ops and repaint immediately after a real change — otherwise
    // the canvas shows a blank frame until the next rAF (visible as a flash
    // when mobile browser chrome collapses/expands on touch).
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.view.setSize(cssWidth, cssHeight);
    this.updateZoomLimits();
    if (this.initialized) this.render();
  }

  /**
   * Min zoom is either the point where a maxCells grid covers the viewport
   * (desktop: zooming out grows the grid), or — with coverMinZoom — the point
   * where the *current* grid covers it (mobile: boot view is max zoom-out).
   */
  private updateZoomLimits(): void {
    const { width, height } = this.view.getSize();
    const min = this.coverMinZoom
      ? Math.max(width / this.gridW, height / this.gridH)
      : Math.max(width, height) / this.maxCells;
    this.view.setZoomLimits(min, 64);
  }

  /** Pin the minimum zoom to the grid-covers-viewport level (mobile). */
  setCoverMinZoom(on: boolean): void {
    this.coverMinZoom = on;
    this.updateZoomLimits();
  }

  getSize(): { width: number; height: number } {
    return this.view.getSize();
  }

  setCamera(x: number, y: number): void {
    this.view.setCamera(x, y);
  }

  getCamera(): { x: number; y: number } {
    return this.view.getCamera();
  }

  setZoom(zoom: number): void {
    this.view.setZoom(zoom);
  }

  getZoom(): number {
    return this.view.getZoom();
  }

  getSnapshot(): ViewSnapshot {
    return this.view.getSnapshot();
  }

  /** Center the camera on the grid and choose a zoom that fits it. */
  fitToGrid(padding = 0.9): void {
    this.view.setCamera(this.gridW / 2, this.gridH / 2);
    const size = this.view.getSize();
    const zoom = Math.min(size.width / this.gridW, size.height / this.gridH) * padding;
    this.view.setZoom(zoom);
  }

  /**
   * Center the camera and zoom so the grid exactly covers the canvas, with no
   * letterboxing. Counterpart to fitToGrid(), which insets the grid instead.
   */
  coverGrid(): void {
    this.view.setCamera(this.gridW / 2, this.gridH / 2);
    const size = this.view.getSize();
    this.view.setZoom(Math.max(size.width / this.gridW, size.height / this.gridH));
  }

  // ---- render config --------------------------------------------------------

  setRenderConfig(config: Partial<RenderConfig>): void {
    this.renderConfig = { ...this.renderConfig, ...config };
  }

  getRenderConfig(): RenderConfig {
    return { ...this.renderConfig };
  }

  // ---- persistence ----------------------------------------------------------

  export(): Record<string, number> {
    return this.automaton.getValues();
  }

  import(values: Record<string, number>): void {
    this.automaton.setValues(values);
  }
}
