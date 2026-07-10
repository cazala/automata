/**
 * Lenia — continuous cellular automata (Chan, 2019)
 *
 * The continuous generalization of Life: each cell holds a value in [0, 1],
 * perceived through a ring-shaped kernel of radius R (poly4 shell
 * (4r(1-r))^4, normalized to sum 1), and nudged by a gaussian growth curve:
 *
 *   u  = Σ K·cells                       (kernel-weighted neighbourhood mean)
 *   g  = 2·exp(-(u-mu)² / 2sigma²) - 1   (growth in [-1, 1])
 *   c' = clamp(c + dt·g, 0, 1)
 *
 * mu/sigma pick the viable band of neighbourhood density; dt sets integration
 * smoothness. The classic "orbium" world is mu=0.15, sigma=0.017, dt=0.1,
 * R=13; the defaults here (sigma=0.023, R=10) trade a little of that
 * knife-edge character for robust growth from random blob seeds (verified:
 * sigma 0.017 dies out from noise, 0.03 saturates into plateaus).
 * Radius is baked into the shader loop and the kernel weights are a
 * storage buffer, so changing R rebuilds; mu/sigma/dt are realtime.
 *
 * Cost scales with R²: R=13 reads 729 taps per cell per step.
 */

import { Automaton, type AutomatonDescriptor } from "../automaton";

export interface LeniaOptions {
  /** Kernel radius in cells (4-16, default 10). Rebuilds on change. */
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

  private radius: number;

  constructor(options: LeniaOptions = {}) {
    super();
    this.radius = Math.max(4, Math.min(16, Math.floor(options.radius ?? 10)));
    this.values.mu = options.mu ?? 0.15;
    this.values.sigma = options.sigma ?? 0.023;
    this.values.dt = options.dt ?? 0.1;
  }

  build(): AutomatonDescriptor {
    const R = this.radius;
    const size = R * 2 + 1;
    return {
      channels: 1,
      params: [
        { name: "mu", type: "f32", default: 0.15 },
        { name: "sigma", type: "f32", default: 0.023 },
        { name: "dt", type: "f32", default: 0.1 },
      ],
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
    this.set("sigma", Math.max(0.001, v));
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
