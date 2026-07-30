/**
 * GrowingNeural — the differentiable morphogenesis rule from
 * https://distill.pub/2020/growing-ca/
 *
 * The first phase perceives every channel with identity/Sobel-x/Sobel-y,
 * applies a shared ReLU MLP, and writes a stochastic residual candidate. It
 * also records the pre-update life mask in a one-value-per-cell scratch
 * buffer. The second phase applies the reference pre-and-post alpha life rule.
 */

import {
  Automaton,
  type AutomatonDescriptor,
  type ParamSpec,
  type SeedOptions,
} from "../automaton";

export const GROWING_NEURAL_CA_FORMAT =
  "@cazala/automata/growing-neural-ca" as const;
export const GROWING_NEURAL_CA_VERSION = 1 as const;

export interface GrowingNeuralWeights {
  channels: number;
  hidden: number;
  /**
   * Row-major [hidden][channels * 3], with three values per source channel:
   * c0/identity, c0/Sobel-x, c0/Sobel-y, c1/identity, ...
   */
  inputToHidden: ArrayLike<number>;
  hiddenBias: ArrayLike<number>;
  /** Row-major [channels][hidden]. */
  hiddenToOutput: ArrayLike<number>;
  outputBias: ArrayLike<number>;
}

export interface GrowingNeuralWeightsSnapshot {
  channels: number;
  hidden: number;
  inputToHidden: Float32Array;
  hiddenBias: Float32Array;
  hiddenToOutput: Float32Array;
  outputBias: Float32Array;
}

/** JSON-safe inference artifact shared with trainers such as Synaptic. */
export interface GrowingNeuralArtifact {
  format: typeof GROWING_NEURAL_CA_FORMAT;
  version: typeof GROWING_NEURAL_CA_VERSION;
  channels: number;
  hidden: number;
  perception: readonly ["identity", "sobel-x", "sobel-y"];
  activation: "relu";
  fireRate: number;
  stepSize: number;
  boundary: "zero";
  life: {
    channel: 3;
    threshold: number;
    neighborhood: 3;
    preAndPost: true;
  };
  weights: {
    inputToHidden: readonly number[];
    hiddenBias: readonly number[];
    hiddenToOutput: readonly number[];
    outputBias: readonly number[];
  };
}

export interface GrowingNeuralOptions {
  channels?: number;
  hidden?: number;
  fireRate?: number;
  stepSize?: number;
  aliveThreshold?: number;
  seed?: number;
  weights?: GrowingNeuralWeights;
  artifact?: GrowingNeuralArtifact;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GrowingNeural extends Automaton {
  readonly name = "growing-neural";

  static readonly PARAMS: ParamSpec[] = [
    { name: "fireRate", type: "f32", default: 0.5, min: 0, max: 1 },
    { name: "stepSize", type: "f32", default: 1, min: 0, max: 2 },
    {
      name: "aliveThreshold",
      type: "f32",
      default: 0.1,
      min: 0,
      max: 1,
    },
  ];

  static readonly recommendedStepsPerSecond = 60;

  private readonly C: number;
  private readonly H: number;
  private readonly rngSeed: number;
  private w1: Float32Array;
  private b1: Float32Array;
  private w2: Float32Array;
  private b2: Float32Array;

  constructor(options: GrowingNeuralOptions = {}) {
    super(GrowingNeural.PARAMS);
    if (options.weights && options.artifact) {
      throw new TypeError("Provide either weights or artifact, not both");
    }
    const artifact = options.artifact;
    if (artifact) GrowingNeural.validateArtifactHeader(artifact);
    const suppliedWeights = options.weights ?? (artifact
      ? {
          channels: artifact.channels,
          hidden: artifact.hidden,
          ...artifact.weights,
        }
      : undefined);
    this.C = GrowingNeural.dimension(
      "channels",
      options.channels ?? suppliedWeights?.channels ?? 16,
      4,
      32,
    );
    this.H = GrowingNeural.dimension(
      "hidden",
      options.hidden ?? suppliedWeights?.hidden ?? 128,
      1,
      256,
    );
    this.rngSeed = options.seed ?? 0x6e6361;
    const generated = this.generateWeights();
    this.w1 = generated.inputToHidden;
    this.b1 = generated.hiddenBias;
    this.w2 = generated.hiddenToOutput;
    this.b2 = generated.outputBias;
    this.configure({
      fireRate: artifact?.fireRate ?? options.fireRate,
      stepSize: artifact?.stepSize ?? options.stepSize,
      aliveThreshold: artifact?.life.threshold ?? options.aliveThreshold,
    });
    if (suppliedWeights) this.setWeights(suppliedWeights);
  }

  static fromArtifact(artifact: GrowingNeuralArtifact): GrowingNeural {
    return new GrowingNeural({ artifact });
  }

  private static dimension(
    name: string,
    value: number,
    minimum: number,
    maximum: number,
  ): number {
    if (
      !Number.isInteger(value) ||
      value < minimum ||
      value > maximum
    ) {
      throw new RangeError(
        `${name} must be an integer between ${minimum} and ${maximum}`,
      );
    }
    return value;
  }

  private static validateArtifactHeader(
    artifact: GrowingNeuralArtifact,
  ): void {
    if (artifact.format !== GROWING_NEURAL_CA_FORMAT) {
      throw new TypeError(`Unsupported Growing Neural CA format: ${artifact.format}`);
    }
    if (artifact.version !== GROWING_NEURAL_CA_VERSION) {
      throw new TypeError(
        `Unsupported Growing Neural CA artifact version: ${artifact.version}`,
      );
    }
    if (
      artifact.activation !== "relu" ||
      artifact.boundary !== "zero" ||
      artifact.life.channel !== 3 ||
      artifact.life.neighborhood !== 3 ||
      artifact.life.preAndPost !== true
    ) {
      throw new TypeError("Artifact semantics do not match Growing Neural CA v1");
    }
    const perception = Array.from(artifact.perception);
    if (
      perception.length !== 3 ||
      perception[0] !== "identity" ||
      perception[1] !== "sobel-x" ||
      perception[2] !== "sobel-y"
    ) {
      throw new TypeError("Artifact perception does not match Growing Neural CA v1");
    }
  }

  private generateWeights(): GrowingNeuralWeightsSnapshot {
    const perception = this.C * 3;
    const random = mulberry32(this.rngSeed);
    const scale = Math.sqrt(6 / (perception + this.H));
    return {
      channels: this.C,
      hidden: this.H,
      inputToHidden: Float32Array.from(
        { length: this.H * perception },
        () => (random() * 2 - 1) * scale,
      ),
      hiddenBias: new Float32Array(this.H),
      // The reference rule starts as an identity by zero-initializing the
      // final pointwise convolution.
      hiddenToOutput: new Float32Array(this.C * this.H),
      outputBias: new Float32Array(this.C),
    };
  }

  private static copyWeightArray(
    name: string,
    source: ArrayLike<number>,
    expectedLength: number,
  ): Float32Array {
    if (source.length !== expectedLength) {
      throw new RangeError(
        `${name} has length ${source.length}; expected ${expectedLength}`,
      );
    }
    const copy = new Float32Array(expectedLength);
    for (let index = 0; index < expectedLength; index++) {
      const value = source[index];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name}[${index}] must be finite`);
      }
      copy[index] = value;
      if (!Number.isFinite(copy[index])) {
        throw new RangeError(`${name}[${index}] is outside the f32 range`);
      }
    }
    return copy;
  }

  setWeights(weights: GrowingNeuralWeights): void {
    if (weights.channels !== this.C || weights.hidden !== this.H) {
      throw new RangeError(
        `Growing Neural weights target ${weights.channels} channels and ` +
          `${weights.hidden} hidden units; expected ${this.C} and ${this.H}`,
      );
    }
    const perception = this.C * 3;
    const w1 = GrowingNeural.copyWeightArray(
      "inputToHidden",
      weights.inputToHidden,
      this.H * perception,
    );
    const b1 = GrowingNeural.copyWeightArray(
      "hiddenBias",
      weights.hiddenBias,
      this.H,
    );
    const w2 = GrowingNeural.copyWeightArray(
      "hiddenToOutput",
      weights.hiddenToOutput,
      this.C * this.H,
    );
    const b2 = GrowingNeural.copyWeightArray(
      "outputBias",
      weights.outputBias,
      this.C,
    );
    this.w1 = w1;
    this.b1 = b1;
    this.w2 = w2;
    this.b2 = b2;
    this.updateStorage("weights1", w1);
    this.updateStorage("bias1", b1);
    this.updateStorage("weights2", w2);
    this.updateStorage("bias2", b2);
  }

  getWeights(): GrowingNeuralWeightsSnapshot {
    return {
      channels: this.C,
      hidden: this.H,
      inputToHidden: this.w1.slice(),
      hiddenBias: this.b1.slice(),
      hiddenToOutput: this.w2.slice(),
      outputBias: this.b2.slice(),
    };
  }

  getArtifact(): GrowingNeuralArtifact {
    return {
      format: GROWING_NEURAL_CA_FORMAT,
      version: GROWING_NEURAL_CA_VERSION,
      channels: this.C,
      hidden: this.H,
      perception: ["identity", "sobel-x", "sobel-y"],
      activation: "relu",
      fireRate: this.get("fireRate"),
      stepSize: this.get("stepSize"),
      boundary: "zero",
      life: {
        channel: 3,
        threshold: this.get("aliveThreshold"),
        neighborhood: 3,
        preAndPost: true,
      },
      weights: {
        inputToHidden: Array.from(this.w1),
        hiddenBias: Array.from(this.b1),
        hiddenToOutput: Array.from(this.w2),
        outputBias: Array.from(this.b2),
      },
    };
  }

  getChannels(): number {
    return this.C;
  }

  getHidden(): number {
    return this.H;
  }

  setFireRate(value: number): void {
    this.set("fireRate", value);
  }

  getFireRate(): number {
    return this.get("fireRate");
  }

  setStepSize(value: number): void {
    this.set("stepSize", value);
  }

  getStepSize(): number {
    return this.get("stepSize");
  }

  setAliveThreshold(value: number): void {
    this.set("aliveThreshold", value);
  }

  getAliveThreshold(): number {
    return this.get("aliveThreshold");
  }

  build(): AutomatonDescriptor {
    const C = this.C;
    const H = this.H;
    const P = C * 3;
    return {
      channels: C,
      boundary: "zero",
      render: { colorMode: 3 },
      params: GrowingNeural.PARAMS,
      storages: [
        { name: "weights1", data: this.w1 },
        { name: "bias1", data: this.b1 },
        { name: "weights2", data: this.w2 },
        { name: "bias2", data: this.b2 },
      ],
      scratch: [{ name: "preLife", valuesPerCell: 1 }],
      step: /* wgsl */ `
  var maxAlpha = 0.0;
  for (var ay: i32 = -1; ay <= 1; ay = ay + 1) {
    for (var ax: i32 = -1; ax <= 1; ax = ax + 1) {
      maxAlpha = max(maxAlpha, sampleAt(x + ax, y + ay, 3));
    }
  }
  let cell = u32(x) + u32(y) * sim.width;
  preLife[cell] = select(0.0, 1.0, maxAlpha > params.aliveThreshold);

  var perception: array<f32, ${P}>;
  for (var c: i32 = 0; c < ${C}; c = c + 1) {
    let s00 = sampleAt(x - 1, y - 1, c);
    let s10 = sampleAt(x,     y - 1, c);
    let s20 = sampleAt(x + 1, y - 1, c);
    let s01 = sampleAt(x - 1, y,     c);
    let s11 = sampleAt(x,     y,     c);
    let s21 = sampleAt(x + 1, y,     c);
    let s02 = sampleAt(x - 1, y + 1, c);
    let s12 = sampleAt(x,     y + 1, c);
    let s22 = sampleAt(x + 1, y + 1, c);
    let gx = (s20 + 2.0 * s21 + s22 - s00 - 2.0 * s01 - s02) / 8.0;
    let gy = (s02 + 2.0 * s12 + s22 - s00 - 2.0 * s10 - s20) / 8.0;
    // TensorFlow depthwise_conv2d orders the channel multiplier inside each
    // source channel: c0/id, c0/dx, c0/dy, c1/id, ...
    perception[c * 3] = s11;
    perception[c * 3 + 1] = gx;
    perception[c * 3 + 2] = gy;
  }

  var delta: array<f32, ${C}>;
  for (var c: i32 = 0; c < ${C}; c = c + 1) {
    delta[c] = bias2[c];
  }
  for (var h: i32 = 0; h < ${H}; h = h + 1) {
    var hidden = bias1[h];
    for (var k: i32 = 0; k < ${P}; k = k + 1) {
      hidden = hidden + weights1[h * ${P} + k] * perception[k];
    }
    hidden = max(hidden, 0.0);
    for (var c: i32 = 0; c < ${C}; c = c + 1) {
      delta[c] = delta[c] + weights2[c * ${H} + h] * hidden;
    }
  }

  let doUpdate = rand01(cell + sim.seed) <= params.fireRate;
  for (var c: i32 = 0; c < ${C}; c = c + 1) {
    let previous = sampleAt(x, y, c);
    let candidate = previous + select(0.0, delta[c] * params.stepSize, doUpdate);
    setCell(x, y, c, candidate);
  }`,
      phases: [{
        name: "post-life-mask",
        step: /* wgsl */ `
  var maxAlpha = 0.0;
  for (var ay: i32 = -1; ay <= 1; ay = ay + 1) {
    for (var ax: i32 = -1; ax <= 1; ax = ax + 1) {
      maxAlpha = max(maxAlpha, sampleAt(x + ax, y + ay, 3));
    }
  }
  let cell = u32(x) + u32(y) * sim.width;
  let alive = preLife[cell] > 0.5 && maxAlpha > params.aliveThreshold;
  for (var c: i32 = 0; c < ${C}; c = c + 1) {
    setCell(x, y, c, select(0.0, sampleAt(x, y, c), alive));
  }`,
      }],
    };
  }

  seed(
    width: number,
    height: number,
    options: SeedOptions = {},
  ): Float32Array {
    const data = new Float32Array(width * height * this.C);
    if (options.mode === "clear") return data;
    const base =
      (Math.floor(height / 2) * width + Math.floor(width / 2)) * this.C;
    for (let channel = 3; channel < this.C; channel++) {
      data[base + channel] = 1;
    }
    return data;
  }
}
