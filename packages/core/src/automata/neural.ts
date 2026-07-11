/**
 * Neural — neural cellular automata (configurable substrate, no training)
 *
 * Two substrates, selected by `mode`:
 *
 * "direct" (default): each channel is independently convolved with a symmetric
 * 3x3 kernel and passed straight through the activation:
 *
 *     v = activate(conv3x3(v, kernel))
 *
 * With the inverted-gaussian activation and the default kernel this is the
 * classic "neural worms" rule. `updateRate`, `stepSize` and `aliveMask` do not
 * apply in this mode — the recurrence is deterministic and has no residual term.
 *
 * "network": each cell holds C channels perceived through 4 filters (identity,
 * Sobel-x, Sobel-y, the symmetric kernel), fed to a 2-layer MLP (perception ->
 * hidden -> delta) with random weights from a reseedable seed, applied as a
 * residual update under a stochastic per-cell mask. Optional alive-masking uses
 * channel 3 as an alpha (classic Growing-NCA style).
 *
 * Mode, channel count C and hidden size H are baked into the generated WGSL, so
 * changing them (or reseeding) regenerates the weights and triggers a rebuild.
 * Everything else (activation, kernel, updateRate, stepSize, aliveMask) is a
 * realtime uniform.
 */

import {
  Automaton,
  type AutomatonDescriptor,
  type ParamSpec,
  type SeedMode,
  type SeedOptions,
} from "../automaton";

export type Activation = 0 | 1 | 2 | 3; // relu | tanh | sigmoid | inverted gaussian

export type NeuralMode = "network" | "direct";

/** Symmetric 3x3 convolution kernel: corners, orthogonal edges, and the center tap. */
export interface Kernel {
  center: number;
  edge: number;
  corner: number;
}

/** The kernel + activation that produce the classic "worms" rule in direct mode. */
export const WORMS_KERNEL: Kernel = { center: -0.66, edge: -0.9, corner: 0.68 };
export const WORMS_GAUSS_WIDTH = 0.6;

/** Perception filters per channel in network mode: identity, sobelX, sobelY, kernel. */
const FILTERS = 4;

export interface NeuralOptions {
  mode?: NeuralMode;
  channels?: number;
  hidden?: number;
  seed?: number;
  activation?: Activation;
  updateRate?: number;
  stepSize?: number;
  aliveMask?: boolean;
  gaussWidth?: number;
  kernel?: Partial<Kernel>;
}

export interface NeuralPreset {
  label: string;
  mode: NeuralMode;
  /** Realtime param values to apply. */
  values: Record<string, number>;
  /** The initial state this preset develops best from. */
  seed: SeedOptions;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Neural extends Automaton {
  readonly name = "neural";

  static readonly PARAMS: ParamSpec[] = [
    { name: "activation", type: "u32", default: 3, min: 0, max: 3 },
    { name: "updateRate", type: "f32", default: 0.5, min: 0, max: 1 },
    { name: "stepSize", type: "f32", default: 0.1, min: 0.01, max: 0.5 },
    { name: "aliveMask", type: "u32", default: 0, min: 0, max: 1 },
    { name: "gaussWidth", type: "f32", default: WORMS_GAUSS_WIDTH, min: 0.05, max: 3 },
    { name: "kCenter", type: "f32", default: WORMS_KERNEL.center, min: -2, max: 2 },
    { name: "kEdge", type: "f32", default: WORMS_KERNEL.edge, min: -2, max: 2 },
    { name: "kCorner", type: "f32", default: WORMS_KERNEL.corner, min: -2, max: 2 },
  ];

  /** Verified conv->activation pattern rules, plus the random-MLP substrate. */
  static readonly PRESETS: Record<string, NeuralPreset> = {
    worms: {
      label: "Worms",
      mode: "direct",
      values: {
        activation: 3,
        gaussWidth: 0.6,
        kCenter: WORMS_KERNEL.center,
        kEdge: WORMS_KERNEL.edge,
        kCorner: WORMS_KERNEL.corner,
      },
      seed: { mode: "random", density: 0.2 },
    },
    mitosis: {
      label: "Mitosis",
      mode: "direct",
      values: { activation: 3, gaussWidth: 1.3, kCenter: 0.4, kEdge: 0.88, kCorner: -0.94 },
      seed: { mode: "noise", density: 0.5 },
    },
    mosaic: {
      label: "Mosaic",
      mode: "direct",
      values: { activation: 3, gaussWidth: 0.6, kCenter: 0.66, kEdge: 0.9, kCorner: -0.68 },
      seed: { mode: "noise", density: 0.5 },
    },
    network: {
      label: "Random network",
      mode: "network",
      values: { activation: 1, updateRate: 0.5, stepSize: 0.1 },
      seed: { mode: "random", density: 0.2 },
    },
  };

  static readonly recommendedStepsPerSecond = 120;

  private mode: NeuralMode;
  private C: number;
  private H: number;
  private rngSeed: number;

  private w1!: Float32Array; // [H * (C*FILTERS)]
  private b1!: Float32Array; // [H]
  private w2!: Float32Array; // [C * H]
  private b2!: Float32Array; // [C]

  constructor(options: NeuralOptions = {}) {
    super(Neural.PARAMS);
    this.mode = options.mode ?? "direct";
    this.C = Math.max(1, Math.min(16, Math.floor(options.channels ?? 6)));
    this.H = Math.max(1, Math.min(64, Math.floor(options.hidden ?? 32)));
    this.rngSeed = options.seed ?? (Math.random() * 1e9) | 0;
    this.configure(options);
    if (options.aliveMask !== undefined) this.set("aliveMask", options.aliveMask ? 1 : 0);
    if (options.kernel?.center !== undefined) this.set("kCenter", options.kernel.center);
    if (options.kernel?.edge !== undefined) this.set("kEdge", options.kernel.edge);
    if (options.kernel?.corner !== undefined) this.set("kCorner", options.kernel.corner);
    this.generateWeights();
  }

  /** Apply a named preset (mode + realtime values). Returns its seed options. */
  applyPreset(name: keyof typeof Neural.PRESETS): SeedOptions {
    const preset = Neural.PRESETS[name];
    this.setMode(preset.mode);
    this.setValues(preset.values);
    return preset.seed;
  }

  private generateWeights(): void {
    const P = this.C * FILTERS;
    const rnd = mulberry32(this.rngSeed);
    const scale1 = Math.sqrt(6 / (P + this.H));
    const scale2 = Math.sqrt(6 / (this.H + this.C));
    this.w1 = new Float32Array(this.H * P);
    this.b1 = new Float32Array(this.H);
    this.w2 = new Float32Array(this.C * this.H);
    this.b2 = new Float32Array(this.C);
    for (let i = 0; i < this.w1.length; i++) this.w1[i] = (rnd() * 2 - 1) * scale1;
    for (let i = 0; i < this.w2.length; i++) this.w2[i] = (rnd() * 2 - 1) * scale2;
    // biases left at 0 for stability
  }

  /** The 9 neighbourhood taps of channel `c`, as WGSL let-bindings s00..s22. */
  private static taps(): string {
    return /* wgsl */ `
    let s00 = sampleAt(x - 1, y - 1, c);
    let s10 = sampleAt(x,     y - 1, c);
    let s20 = sampleAt(x + 1, y - 1, c);
    let s01 = sampleAt(x - 1, y,     c);
    let s11 = sampleAt(x,     y,     c);
    let s21 = sampleAt(x + 1, y,     c);
    let s02 = sampleAt(x - 1, y + 1, c);
    let s12 = sampleAt(x,     y + 1, c);
    let s22 = sampleAt(x + 1, y + 1, c);`;
  }

  private static readonly KERNEL_SUM = /* wgsl */ `
    let kern = params.kCorner * (s00 + s20 + s02 + s22)
             + params.kEdge   * (s10 + s01 + s21 + s12)
             + params.kCenter * s11;`;

  private static readonly GLOBALS = /* wgsl */ `
fn activate(v: f32) -> f32 {
  if (params.activation == 0u) { return max(v, 0.0); }
  if (params.activation == 1u) { return tanh(v); }
  if (params.activation == 2u) { return 1.0 / (1.0 + exp(-v)); }
  // Inverted gaussian bell: 0 at v = 0, rising to 1 as |v| grows.
  if (params.activation == 3u) { return 1.0 - exp2(-params.gaussWidth * v * v); }
  return v;
}`;

  build(): AutomatonDescriptor {
    return this.mode === "direct" ? this.buildDirect() : this.buildNetwork();
  }

  private buildDirect(): AutomatonDescriptor {
    return {
      channels: this.C,
      // The conv->activation recurrence oscillates its fine texture between
      // two phases on alternating steps; rendering mixed parities flickers.
      stepParity: 2,
      render: { colorMode: 1 },
      params: Neural.PARAMS,
      globals: Neural.GLOBALS,
      step: /* wgsl */ `
  for (var c: i32 = 0; c < ${this.C}; c = c + 1) {${Neural.taps()}${Neural.KERNEL_SUM}
    setCell(x, y, c, clamp(activate(kern), -1.0, 1.0));
  }`,
    };
  }

  private buildNetwork(): AutomatonDescriptor {
    const C = this.C;
    const H = this.H;
    const P = C * FILTERS;

    const aliveBlock =
      C >= 4
        ? /* wgsl */ `
  if (params.aliveMask == 1u) {
    var maxA = 0.0;
    for (var ay: i32 = -1; ay <= 1; ay = ay + 1) {
      for (var ax: i32 = -1; ax <= 1; ax = ax + 1) {
        maxA = max(maxA, sampleAt(x + ax, y + ay, 3));
      }
    }
    if (maxA <= 0.1) {
      for (var cc: i32 = 0; cc < ${C}; cc = cc + 1) { setCell(x, y, cc, 0.0); }
      return;
    }
  }`
        : "";

    return {
      channels: C,
      render: { colorMode: 1 },
      params: Neural.PARAMS,
      storages: [
        { name: "weights1", data: this.w1 },
        { name: "bias1", data: this.b1 },
        { name: "weights2", data: this.w2 },
        { name: "bias2", data: this.b2 },
      ],
      globals: Neural.GLOBALS,
      step: /* wgsl */ `${aliveBlock}
  var perception: array<f32, ${P}>;
  for (var c: i32 = 0; c < ${C}; c = c + 1) {${Neural.taps()}
    let gx = (s20 + 2.0 * s21 + s22 - s00 - 2.0 * s01 - s02) / 8.0;
    let gy = (s02 + 2.0 * s12 + s22 - s00 - 2.0 * s10 - s20) / 8.0;${Neural.KERNEL_SUM}
    perception[c] = s11;
    perception[${C} + c] = gx;
    perception[${2 * C} + c] = gy;
    perception[${3 * C} + c] = kern;
  }

  var hidden: array<f32, ${H}>;
  for (var h: i32 = 0; h < ${H}; h = h + 1) {
    var acc = bias1[h];
    for (var k: i32 = 0; k < ${P}; k = k + 1) {
      acc = acc + weights1[h * ${P} + k] * perception[k];
    }
    hidden[h] = activate(acc);
  }

  let rnd = rand01(u32(x) + u32(y) * sim.width + sim.seed);
  let doUpdate = rnd < params.updateRate;
  for (var c: i32 = 0; c < ${C}; c = c + 1) {
    var acc = bias2[c];
    for (var h: i32 = 0; h < ${H}; h = h + 1) {
      acc = acc + weights2[c * ${H} + h] * hidden[h];
    }
    var v = sampleAt(x, y, c);
    if (doUpdate) {
      v = v + acc * params.stepSize;
    }
    setCell(x, y, c, clamp(v, -1.0, 1.0));
  }`,
    };
  }

  /**
   * "random" seeds whole cells (all channels agree, so direct mode renders as
   * one coherent field); "noise" gives each channel its own field, which the
   * rgb mapping displays as overlaid colored patterns; "center" plants a
   * single all-channel live cell.
   */
  seed(width: number, height: number, options: SeedOptions = {}): Float32Array {
    const { mode = "random" as SeedMode, density = 0.2 } = options;
    const data = new Float32Array(width * height * this.C);
    if (mode === "clear") return data;
    if (mode === "center") {
      const base = (Math.floor(height / 2) * width + Math.floor(width / 2)) * this.C;
      for (let c = 0; c < this.C; c++) data[base + c] = 1;
      return data;
    }
    for (let i = 0; i < width * height; i++) {
      const base = i * this.C;
      if (mode === "noise") {
        for (let c = 0; c < this.C; c++) {
          data[base + c] = Math.random() < density ? 1 : 0;
        }
      } else if (Math.random() < density) {
        for (let c = 0; c < this.C; c++) data[base + c] = 1;
      }
    }
    return data;
  }

  // ---- structural (rebuild) -------------------------------------------------

  setMode(mode: NeuralMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.requestRebuild();
  }

  getMode(): NeuralMode {
    return this.mode;
  }

  setChannels(n: number): void {
    this.C = Math.max(1, Math.min(16, Math.floor(n)));
    this.generateWeights();
    this.requestRebuild();
  }

  getChannels(): number {
    return this.C;
  }

  setHidden(n: number): void {
    this.H = Math.max(1, Math.min(64, Math.floor(n)));
    this.generateWeights();
    this.requestRebuild();
  }

  getHidden(): number {
    return this.H;
  }

  reseed(seed?: number): void {
    this.rngSeed = seed ?? ((Math.random() * 1e9) | 0);
    this.generateWeights();
    this.requestRebuild();
  }

  getSeed(): number {
    return this.rngSeed;
  }

  // ---- realtime params ------------------------------------------------------

  setActivation(a: Activation): void {
    this.set("activation", a);
  }

  getActivation(): Activation {
    return this.get("activation") as Activation;
  }

  setUpdateRate(v: number): void {
    this.set("updateRate", v);
  }

  getUpdateRate(): number {
    return this.get("updateRate");
  }

  setStepSize(v: number): void {
    this.set("stepSize", v);
  }

  getStepSize(): number {
    return this.get("stepSize");
  }

  setAliveMask(on: boolean): void {
    this.set("aliveMask", on ? 1 : 0);
  }

  getAliveMask(): boolean {
    return this.get("aliveMask") > 0.5;
  }

  /** Width of the inverted-gaussian activation; larger = tighter bell. */
  setGaussWidth(v: number): void {
    this.set("gaussWidth", v);
  }

  getGaussWidth(): number {
    return this.get("gaussWidth");
  }

  setKernel(k: Partial<Kernel>): void {
    if (k.center !== undefined) this.set("kCenter", k.center);
    if (k.edge !== undefined) this.set("kEdge", k.edge);
    if (k.corner !== undefined) this.set("kCorner", k.corner);
  }

  getKernel(): Kernel {
    return {
      center: this.get("kCenter"),
      edge: this.get("kEdge"),
      corner: this.get("kCorner"),
    };
  }
}
