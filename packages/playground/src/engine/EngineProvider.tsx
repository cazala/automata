import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import {
  Engine,
  Life,
  Elementary,
  Neural,
  Pokemon,
  POKEMON_TYPES,
  POKEMON_TYPE_COUNT,
  ReactionDiffusion,
  Lenia,
  type Activation,
  type Automaton,
  type RenderConfig,
} from "@cazala/automata";
import { hexToRgba } from "../utils/color";
import { isMobileDevice } from "../utils/deviceCapabilities";
import { useAppDispatch, useAppSelector } from "../store";
import { setFps, setPlaying } from "../store/uiSlice";
import type { ConfigState } from "../store/configSlice";

interface EngineApi {
  engineRef: React.MutableRefObject<Engine | null>;
  init: (canvas: HTMLCanvasElement) => Promise<void>;
  destroy: () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  step: () => void;
  reset: () => void;
  clear: () => void;
  applyInit: () => void;
  eraseAt: (worldX: number, worldY: number) => void;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  handleWheel: (deltaY: number, cx: number, cy: number) => void;
  zoomAt: (factor: number, cx: number, cy: number) => void;
  panBy: (dxCss: number, dyCss: number) => void;
  resizeCanvas: (cssW: number, cssH: number) => void;
  resetView: () => void;
}

const EngineContext = createContext<EngineApi | null>(null);

export function useEngine(): EngineApi {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error("useEngine must be used within EngineProvider");
  return ctx;
}

const MIN_CELLS = 16;
const MAX_CELLS = 2048;

/**
 * Initial cell size in CSS pixels. The grid is sized so every display boots at
 * this cell size regardless of resolution (a 2560px-wide desktop gets ~1707
 * cells, a 390px-wide phone ~260), capped at MAX_CELLS on huge screens.
 * ensureGridCovers() keeps the coverage as the user zooms/resizes after that.
 */
const DEFAULT_CELL_PX = 1.5;
const REACTION_CELL_PX = 1;

const clampCells = (n: number) =>
  Math.max(MIN_CELLS, Math.min(MAX_CELLS, Math.round(n)));

function cellPxForType(type: ConfigState["type"]): number {
  return type === "rd" ? REACTION_CELL_PX : DEFAULT_CELL_PX;
}

function gridForCanvas(cssW: number, cssH: number, type: ConfigState["type"]) {
  const cellPx = cellPxForType(type);
  return {
    width: clampCells(Math.ceil(cssW / cellPx)),
    height: clampCells(Math.ceil(cssH / cellPx)),
  };
}

function buildAutomaton(config: ConfigState): Automaton {
  switch (config.type) {
    case "life":
      return new Life({
        birth: config.life.birth,
        survival: config.life.survival,
      });
    case "elementary":
      return new Elementary({ rule: config.elementary.rule });
    case "neural":
      return new Neural({
        mode: config.neural.mode,
        channels: config.neural.channels,
        hidden: config.neural.hidden,
        seed: config.neural.seed,
        activation: config.neural.activation as Activation,
        updateRate: config.neural.updateRate,
        stepSize: config.neural.stepSize,
        aliveMask: config.neural.aliveMask,
        gaussWidth: config.neural.gaussWidth,
        kernel: {
          center: config.neural.kCenter,
          edge: config.neural.kEdge,
          corner: config.neural.kCorner,
        },
      });
    case "pokemon":
      return new Pokemon({ threshold: config.pokemon.threshold });
    case "rd":
      return new ReactionDiffusion({
        feed: config.rd.feed,
        kill: config.rd.kill,
        diffU: config.rd.diffU,
        diffV: config.rd.diffV,
        dt: config.rd.dt,
      });
    case "lenia":
      return new Lenia({
        radius: config.lenia.radius,
        mu: config.lenia.mu,
        sigma: config.lenia.sigma,
        dt: config.lenia.dt,
      });
  }
}

function renderConfigFrom(config: ConfigState): Partial<RenderConfig> {
  if (config.type === "pokemon") {
    // Cells carry their own palette rgb; a black->white ramp makes the
    // channel-wise mix an identity so the type colors display verbatim.
    return {
      colorOn: { r: 1, g: 1, b: 1, a: 1 },
      colorOff: { r: 0, g: 0, b: 0, a: 1 },
      colorBg: hexToRgba(config.render.colorBg),
      showGrid: config.render.showGrid,
      gridThreshold: 6,
      colorMode: 1,
    };
  }
  if (config.type === "rd") {
    // Channel 0 is chemical U, which idles at 1 and *dips* where patterns
    // form — swap on/off so the empty field renders dark and patterns light.
    return {
      colorOn: hexToRgba(config.render.colorOff),
      colorOff: hexToRgba(config.render.colorOn),
      colorBg: hexToRgba(config.render.colorBg),
      showGrid: config.render.showGrid,
      gridThreshold: 6,
      colorMode: 0,
    };
  }
  return {
    colorOn: hexToRgba(config.render.colorOn),
    colorOff: hexToRgba(config.render.colorOff),
    colorBg: hexToRgba(config.render.colorBg),
    showGrid: config.render.showGrid,
    gridThreshold: 6,
    colorMode: config.type === "neural" ? 1 : 0,
  };
}

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const config = useAppSelector((s) => s.config);
  const initNonce = useAppSelector((s) => s.ui.initNonce);

  const engineRef = useRef<Engine | null>(null);
  const automatonRef = useRef<Automaton | null>(null);
  // Synchronous guard against React StrictMode double-invoking init before the
  // async initialize() resolves and sets engineRef.
  const initStarted = useRef(false);
  // Latest config, kept in a ref so imperative helpers see fresh values.
  const configRef = useRef(config);
  configRef.current = config;

  // ---- init pattern ---------------------------------------------------------

  const applyInit = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const cfg = configRef.current;
    const { width, height } = engine.getGridSize();
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);

    engine.clear();

    if (cfg.type === "elementary") {
      engine.setCell(cx, 0, [1]);
      return;
    }

    if (cfg.type === "rd") {
      // Idle state is u=1 (fed), v=0; patterns grow from ragged patches of V.
      // The faint V noise and irregular seed shapes matter: a perfectly
      // symmetric, noiseless field freezes into round spots that never divide
      // (verified — mitosis stays at constant coverage without them).
      // engine.clear()'s all-zero state is inert for Gray-Scott, so build the
      // field explicitly even for "clear".
      const data = new Float32Array(width * height * 2);
      for (let i = 0; i < width * height; i++) {
        data[i * 2] = 1;
        data[i * 2 + 1] = Math.random() * 0.02;
      }
      const seed = (sx: number, sy: number, size: number) => {
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            if (Math.random() < 0.25) continue; // ragged edge
            const px = (sx + dx + width) % width;
            const py = (sy + dy + height) % height;
            data[(py * width + px) * 2 + 1] = 1;
          }
        }
      };
      if (cfg.init.mode === "center") {
        seed(cx - 4, cy - 4, 8);
      } else if (cfg.init.mode !== "clear") {
        const count = Math.max(1, Math.round(cfg.init.density * 40));
        for (let i = 0; i < count; i++) {
          seed(
            Math.floor(Math.random() * width),
            Math.floor(Math.random() * height),
            6
          );
        }
      }
      engine.setCells(data);
      return;
    }

    if (cfg.type === "lenia") {
      // Blobs of continuous noise; uniform noise everywhere mostly cancels
      // itself out, while blob-scale patches match the kernel radius.
      const data = new Float32Array(width * height);
      const R = Math.max(4, cfg.lenia.radius);
      const count = Math.max(1, Math.round(cfg.init.density * 150));
      for (let k = 0; k < count; k++) {
        const sx = Math.floor(Math.random() * width);
        const sy = Math.floor(Math.random() * height);
        const size = R + Math.floor(Math.random() * R);
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const px = (sx + dx) % width;
            const py = (sy + dy) % height;
            data[py * width + px] = Math.random();
          }
        }
      }
      if (cfg.init.mode === "center") {
        data.fill(0);
        for (let dy = -R; dy < R; dy++) {
          for (let dx = -R; dx < R; dx++) {
            const px = (cx + dx + width) % width;
            const py = (cy + dy + height) % height;
            data[py * width + px] = Math.random();
          }
        }
      }
      if (cfg.init.mode === "clear") data.fill(0);
      engine.setCells(data);
      return;
    }

    if (cfg.type === "pokemon") {
      // Start as a voronoi mosaic of single-type regions (jittered-grid Worley
      // sites) instead of per-cell noise: uncorrelated noise deadlocks at
      // threshold 3 because no cell ever sees 3 aligned attackers, while
      // coherent domains give straight borders where the battle rule stays
      // active. Disabled types can never re-emerge, since cells only ever
      // convert to a neighbour's type.
      const pool: number[] = [];
      for (let t = 0; t < POKEMON_TYPE_COUNT; t++) {
        if (cfg.pokemon.enabled[t] ?? true) pool.push(t);
      }
      if (pool.length === 0) pool.push(0);

      const S = Math.max(2, Math.floor(cfg.pokemon.regionSize));
      const bw = Math.max(1, Math.ceil(width / S));
      const bh = Math.max(1, Math.ceil(height / S));
      const siteX = new Float32Array(bw * bh);
      const siteY = new Float32Array(bw * bh);
      const siteT = new Uint8Array(bw * bh);
      for (let i = 0; i < bw * bh; i++) {
        siteX[i] = ((i % bw) + Math.random()) * S;
        siteY[i] = (Math.floor(i / bw) + Math.random()) * S;
        siteT[i] = pool[Math.floor(Math.random() * pool.length)];
      }

      const data = new Float32Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        const by = Math.floor(y / S);
        for (let x = 0; x < width; x++) {
          const bx = Math.floor(x / S);
          let best = Infinity;
          let t = pool[0];
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const nbx = (bx + ox + bw) % bw;
              const nby = (by + oy + bh) % bh;
              const i = nby * bw + nbx;
              // Toroidal deltas so regions tile seamlessly across the wrap.
              let dx = x - siteX[i];
              let dy = y - siteY[i];
              dx -= Math.round(dx / width) * width;
              dy -= Math.round(dy / height) * height;
              const d = dx * dx + dy * dy;
              if (d < best) {
                best = d;
                t = siteT[i];
              }
            }
          }
          const [r, g, b] = POKEMON_TYPES[t].color;
          const base = (y * width + x) * 4;
          data[base] = r / 255;
          data[base + 1] = g / 255;
          data[base + 2] = b / 255;
          data[base + 3] = t;
        }
      }
      engine.setCells(data);
      return;
    }

    if (cfg.init.mode === "clear") return;

    if (cfg.type === "neural") {
      if (cfg.init.mode === "center") {
        // A single live seed (all channels) grows outward.
        engine.seedPoint(cx, cy);
      } else {
        // "random" seeds whole cells, so every channel agrees and direct mode
        // renders as one field; "noise" gives each channel its own field, which
        // the RGB mapping shows as three overlaid fields.
        engine.randomize(
          cfg.init.density,
          cfg.init.mode === "noise" ? "independent" : "all"
        );
      }
      return;
    }

    // life-like rules (single channel, "noise" and "random" coincide)
    if (cfg.init.mode === "random" || cfg.init.mode === "noise") {
      engine.randomize(cfg.init.density);
    } else if (cfg.init.mode === "center") {
      engine.setCell(cx, cy, [1]);
      engine.setCell(cx + 1, cy, [1]);
      engine.setCell(cx - 1, cy, [1]);
      engine.setCell(cx, cy + 1, [1]);
      engine.setCell(cx - 1, cy - 1, [1]);
    }
  }, []);

  // ---- lifecycle ------------------------------------------------------------

  const init = useCallback(
    async (canvas: HTMLCanvasElement) => {
      if (initStarted.current) return;
      initStarted.current = true;
      const cfg = configRef.current;
      const automaton = buildAutomaton(cfg);
      automatonRef.current = automaton;
      const grid = gridForCanvas(
        canvas.clientWidth || window.innerWidth,
        canvas.clientHeight || window.innerHeight,
        cfg.type
      );
      const engine = new Engine({
        canvas,
        automaton,
        grid: { ...grid, wrap: cfg.grid.wrap, maxCells: MAX_CELLS },
        stepsPerSecond: cfg.stepsPerSecond,
        render: renderConfigFrom(cfg),
      });
      engineRef.current = engine;
      await engine.initialize();
      // On touch devices the boot view is the max zoom-out: pinching can only
      // zoom in, so the grid never grows past what a phone GPU handles.
      if (isMobileDevice()) engine.setCoverMinZoom(true);
      engine.coverGrid();
      applyInit();
      // Start a live demo behind the homepage overlay.
      engine.play();
      dispatch(setPlaying(true));
    },
    [applyInit, dispatch]
  );

  const destroy = useCallback(() => {
    engineRef.current?.destroy();
    engineRef.current = null;
    automatonRef.current = null;
  }, []);

  // ---- controls -------------------------------------------------------------

  const play = useCallback(() => {
    engineRef.current?.play();
    dispatch(setPlaying(true));
  }, [dispatch]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    dispatch(setPlaying(false));
  }, [dispatch]);

  const toggle = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (e.isPlaying()) pause();
    else play();
  }, [play, pause]);

  const step = useCallback(() => {
    engineRef.current?.step();
  }, []);

  const clear = useCallback(() => {
    engineRef.current?.clear();
  }, []);

  const reset = useCallback(() => {
    applyInit();
  }, [applyInit]);

  const resetView = useCallback(() => {
    engineRef.current?.coverGrid();
  }, []);

  // ---- interaction ----------------------------------------------------------

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const engine = engineRef.current;
    if (!engine) return { x: 0, y: 0 };
    const { width, height } = engine.getSize();
    const zoom = engine.getZoom();
    const camera = engine.getCamera();
    return {
      x: camera.x + (sx - width / 2) / zoom,
      y: camera.y + (sy - height / 2) / zoom,
    };
  }, []);

  /** Radius (in cells) of the click/drag eraser stamp. */
  const ERASE_RADIUS = 25;

  const eraseAt = useCallback((worldX: number, worldY: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    // "Off" is automaton-specific: Gray-Scott idles at u=1, v=0 (all-zero
    // cells would render bright through its inverted palette and re-ignite);
    // everything else clears to zero.
    const values =
      configRef.current.type === "rd"
        ? [1, 0]
        : new Array(engine.getChannels()).fill(0);
    engine.fillCircle(worldX, worldY, ERASE_RADIUS, values);
  }, []);

  /** Zoom by a factor keeping the world point under (cx, cy) fixed. */
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      const before = screenToWorld(cx, cy);
      engine.setZoom(engine.getZoom() * factor);
      const after = screenToWorld(cx, cy);
      const camera = engine.getCamera();
      engine.setCamera(
        camera.x + (before.x - after.x),
        camera.y + (before.y - after.y)
      );
      engine.ensureGridCovers();
    },
    [screenToWorld]
  );

  const handleWheel = useCallback(
    (deltaY: number, cx: number, cy: number) => {
      zoomAt(Math.pow(0.95, deltaY * 0.01), cx, cy);
    },
    [zoomAt]
  );

  const panBy = useCallback((dxCss: number, dyCss: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const zoom = engine.getZoom();
    const camera = engine.getCamera();
    engine.setCamera(camera.x - dxCss / zoom, camera.y - dyCss / zoom);
    engine.ensureGridCovers();
  }, []);

  const resizeCanvas = useCallback((cssW: number, cssH: number) => {
    const engine = engineRef.current;
    if (!engine || cssW <= 0 || cssH <= 0) return;
    engine.setSize(cssW, cssH);
    engine.ensureGridCovers();
  }, []);

  // ---- config -> engine sync (dual-write realtime) --------------------------

  // Automaton type change: rebuild automaton, swap, reapply init.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const cfg = configRef.current;
    const automaton = buildAutomaton(cfg);
    automatonRef.current = automaton;
    engine.setRenderConfig(renderConfigFrom(cfg));
    engine.setAutomaton(automaton);
    const size = engine.getSize();
    const grid = gridForCanvas(size.width, size.height, cfg.type);
    const current = engine.getGridSize();
    if (current.width !== grid.width || current.height !== grid.height) {
      engine.resize(grid.width, grid.height);
    }
    engine.coverGrid();
    applyInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type]);

  // Life params.
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Life) {
      a.setBirth(config.life.birth);
      a.setSurvival(config.life.survival);
    }
  }, [config.life.birth, config.life.survival]);

  // Elementary params.
  useEffect(() => {
    const a = automatonRef.current;
    const engine = engineRef.current;
    if (a instanceof Elementary && engine) {
      const automaton = buildAutomaton(configRef.current);
      automatonRef.current = automaton;
      engine.setAutomaton(automaton);
      applyInit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.elementary.rule]);

  // Neural realtime params.
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Neural) {
      a.setActivation(config.neural.activation as Activation);
      a.setUpdateRate(config.neural.updateRate);
      a.setStepSize(config.neural.stepSize);
      a.setAliveMask(config.neural.aliveMask);
      a.setGaussWidth(config.neural.gaussWidth);
      a.setKernel({
        center: config.neural.kCenter,
        edge: config.neural.kEdge,
        corner: config.neural.kCorner,
      });
    }
  }, [
    config.neural.activation,
    config.neural.updateRate,
    config.neural.stepSize,
    config.neural.aliveMask,
    config.neural.gaussWidth,
    config.neural.kCenter,
    config.neural.kEdge,
    config.neural.kCorner,
  ]);

  // Neural structural params (rebuild + reapply init).
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Neural) {
      a.setMode(config.neural.mode);
      a.setChannels(config.neural.channels);
      a.setHidden(config.neural.hidden);
      applyInit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.neural.mode, config.neural.channels, config.neural.hidden]);

  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Neural) {
      a.reseed(config.neural.seed);
      applyInit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.neural.seed]);

  // Render config.
  useEffect(() => {
    engineRef.current?.setRenderConfig(renderConfigFrom(configRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.render.colorOn,
    config.render.colorOff,
    config.render.colorBg,
    config.render.showGrid,
  ]);

  // Grid wrap.
  useEffect(() => {
    engineRef.current?.setWrap(config.grid.wrap);
  }, [config.grid.wrap]);

  // Pokemon realtime params.
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Pokemon) a.setThreshold(config.pokemon.threshold);
  }, [config.pokemon.threshold]);

  // Reaction-diffusion realtime params.
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof ReactionDiffusion) {
      a.setFeed(config.rd.feed);
      a.setKill(config.rd.kill);
      a.setDiffU(config.rd.diffU);
      a.setDiffV(config.rd.diffV);
      a.setDt(config.rd.dt);
    }
  }, [config.rd.feed, config.rd.kill, config.rd.diffU, config.rd.diffV, config.rd.dt]);

  // Lenia params (radius is structural and rebuilds; the rest are realtime).
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Lenia) {
      a.setRadius(config.lenia.radius);
      a.setMu(config.lenia.mu);
      a.setSigma(config.lenia.sigma);
      a.setDt(config.lenia.dt);
    }
  }, [config.lenia.radius, config.lenia.mu, config.lenia.sigma, config.lenia.dt]);

  // Steps per second.
  useEffect(() => {
    engineRef.current?.setStepsPerSecond(config.stepsPerSecond);
  }, [config.stepsPerSecond]);

  // Explicit re-seed requests (presets, session loads).
  useEffect(() => {
    if (initNonce > 0) applyInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initNonce]);

  // ---- FPS ticker -----------------------------------------------------------

  useEffect(() => {
    const id = window.setInterval(() => {
      const e = engineRef.current;
      if (e) dispatch(setFps(Math.round(e.getFPS())));
    }, 500);
    return () => window.clearInterval(id);
  }, [dispatch]);

  const api: EngineApi = {
    engineRef,
    init,
    destroy,
    play,
    pause,
    toggle,
    step,
    reset,
    clear,
    applyInit,
    eraseAt,
    screenToWorld,
    handleWheel,
    panBy,
    resizeCanvas,
    resetView,
    zoomAt,
  };

  return <EngineContext.Provider value={api}>{children}</EngineContext.Provider>;
}
