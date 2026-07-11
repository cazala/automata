/**
 * Lenia — continuous cellular automata (Chan, 2019)
 *
 * The continuous generalization of Life: each cell holds a value in [0, 1],
 * perceived through a ring-shaped kernel of radius R (poly4 shell
 * (4r(1-r))^4, normalized to sum 1), and nudged by a gaussian growth curve:
 *
 *   u  = sum(K * cells)                     (kernel-weighted neighbourhood mean)
 *   g  = 2 * exp(-(u-mu)^2 / 2 sigma^2) - 1 (growth in [-1, 1])
 *   c' = clamp(c + dt * g, 0, 1)
 *
 * mu/sigma pick the viable band of neighbourhood density; dt sets integration
 * smoothness. The defaults trade the classic orbium world's knife-edge
 * character for robust growth from random blob seeds. Radius is baked into
 * the shader loop and the kernel weights are a storage buffer, so changing R
 * rebuilds; mu/sigma/dt are realtime.
 *
 * Cost scales with R^2: R=8 reads 289 taps per cell per step, so Lenia runs
 * at lower step rates than the 3x3 automata (~15-60/s reads smoothly since
 * the dynamics are continuous).
 */

import {
  Automaton,
  type AutomatonDescriptor,
  type ParamSpec,
  type SeedOptions,
} from "../automaton";

export interface LeniaOptions {
  /** Kernel radius in cells (4-16, default 8). Rebuilds on change. */
  radius?: number;
  mu?: number;
  sigma?: number;
  dt?: number;
}

function buildKernel(radius: number): Float32Array {
  const size = radius * 2 + 1;
  const w = new Float32Array(size * size);
  let sum = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const r = Math.sqrt(dx * dx + dy * dy) / radius;
      if (r === 0 || r > 1) continue;
      const v = Math.pow(4 * r * (1 - r), 4);
      w[(dy + radius) * size + (dx + radius)] = v;
      sum += v;
    }
  }
  for (let i = 0; i < w.length; i++) w[i] /= sum;
  return w;
}

export class Lenia extends Automaton {
  readonly name = "lenia";

  static readonly PARAMS: ParamSpec[] = [
    { name: "mu", type: "f32", default: 0.2, min: 0.05, max: 0.4 },
    { name: "sigma", type: "f32", default: 0.027, min: 0.005, max: 0.06 },
    { name: "dt", type: "f32", default: 0.1, min: 0.02, max: 0.5 },
  ];

  static readonly recommendedStepsPerSecond = 30;

  private radius: number;

  constructor(options: LeniaOptions = {}) {
    super(Lenia.PARAMS);
    this.radius = Math.max(4, Math.min(16, Math.floor(options.radius ?? 8)));
    this.configure(options);
  }

  build(): AutomatonDescriptor {
    const R = this.radius;
    const size = R * 2 + 1;
    return {
      channels: 1,
      render: { colorMode: 0 },
      params: Lenia.PARAMS,
      storages: [{ name: "kernelW", data: buildKernel(R) }],
      step: /* wgsl */ `
  var u = 0.0;
  for (var dy: i32 = -${R}; dy <= ${R}; dy = dy + 1) {
    for (var dx: i32 = -${R}; dx <= ${R}; dx = dx + 1) {
      let w = kernelW[(dy + ${R}) * ${size} + (dx + ${R})];
      if (w > 0.0) {
        u = u + w * sampleAt(x + dx, y + dy, 0);
      }
    }
  }
  let d = u - params.mu;
  let g = 2.0 * exp(-(d * d) / (2.0 * params.sigma * params.sigma)) - 1.0;
  let c = sampleAt(x, y, 0);
  setCell(x, y, 0, clamp(c + params.dt * g, 0.0, 1.0));`,
    };
  }

  /**
   * Blobs of continuous noise sized to the kernel radius. Uniform noise
   * everywhere mostly cancels itself out, while kernel-scale patches give the
   * growth function coherent neighbourhoods to act on. `density` scales the
   * blob count (default 1); "center" plants a single blob.
   */
  seed(width: number, height: number, options: SeedOptions = {}): Float32Array {
    const { mode = "random", density = 1 } = options;
    const data = new Float32Array(width * height);
    if (mode === "clear") return data;
    const R = this.radius;
    if (mode === "center") {
      const cx = Math.floor(width / 2);
      const cy = Math.floor(height / 2);
      for (let dy = -R; dy < R; dy++) {
        for (let dx = -R; dx < R; dx++) {
          const px = (cx + dx + width) % width;
          const py = (cy + dy + height) % height;
          data[py * width + px] = Math.random();
        }
      }
      return data;
    }
    const count = Math.max(1, Math.round(density * 150));
    for (let k = 0; k < count; k++) {
      const sx = Math.floor(Math.random() * width);
      const sy = Math.floor(Math.random() * height);
      const size = R + Math.floor(Math.random() * R);
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          data[((sy + dy) % height) * width + ((sx + dx) % width)] = Math.random();
        }
      }
    }
    return data;
  }

  // ---- structural (rebuild) -------------------------------------------------

  setRadius(n: number): void {
    const r = Math.max(4, Math.min(16, Math.floor(n)));
    if (r === this.radius) return;
    this.radius = r;
    this.requestRebuild();
  }

  getRadius(): number {
    return this.radius;
  }

  // ---- realtime params ------------------------------------------------------

  setMu(v: number): void {
    this.set("mu", v);
  }

  getMu(): number {
    return this.get("mu");
  }

  setSigma(v: number): void {
    this.set("sigma", v);
  }

  getSigma(): number {
    return this.get("sigma");
  }

  setDt(v: number): void {
    this.set("dt", v);
  }

  getDt(): number {
    return this.get("dt");
  }
}
