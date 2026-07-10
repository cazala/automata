/**
 * ReactionDiffusion — the Gray-Scott two-chemical model
 *
 * Each cell holds chemical concentrations [u, v]. Every step both diffuse
 * (9-point laplacian: edges 0.2, corners 0.05) and react:
 *
 *   u' = u + (Du·lap(u) - u·v² + F·(1-u)) · dt
 *   v' = v + (Dv·lap(v) + u·v² - (F+k)·v) · dt
 *
 * U is continuously fed (rate F) and converted to V by the reaction; V decays
 * (rate F+k). The (F, k) point selects the regime — coral growth, dividing
 * spots, solitons, worms — all from the same equations. The stable classic
 * discretization is Du=1.0, Dv=0.5, dt=1.0.
 *
 * All parameters are realtime uniforms; nothing rebuilds. The idle state is
 * u=1, v=0 (fed, no catalyst), so initial conditions must seed patches of V.
 */

import { Automaton, type AutomatonDescriptor } from "../automaton";

export interface ReactionDiffusionOptions {
  feed?: number;
  kill?: number;
  diffU?: number;
  diffV?: number;
  dt?: number;
}

export class ReactionDiffusion extends Automaton {
  readonly name = "reaction-diffusion";

  constructor(options: ReactionDiffusionOptions = {}) {
    super();
    this.values.feed = options.feed ?? 0.0545;
    this.values.kill = options.kill ?? 0.062;
    this.values.diffU = options.diffU ?? 1.0;
    this.values.diffV = options.diffV ?? 0.5;
    this.values.dt = options.dt ?? 1.0;
  }

  build(): AutomatonDescriptor {
    return {
      channels: 2,
      params: [
        { name: "feed", type: "f32", default: 0.0545 },
        { name: "kill", type: "f32", default: 0.062 },
        { name: "diffU", type: "f32", default: 1.0 },
        { name: "diffV", type: "f32", default: 0.5 },
        { name: "dt", type: "f32", default: 1.0 },
      ],
      step: /* wgsl */ `
  let u = sampleAt(x, y, 0);
  let v = sampleAt(x, y, 1);

  let lapU = 0.2 * (sampleAt(x - 1, y, 0) + sampleAt(x + 1, y, 0)
                  + sampleAt(x, y - 1, 0) + sampleAt(x, y + 1, 0))
           + 0.05 * (sampleAt(x - 1, y - 1, 0) + sampleAt(x + 1, y - 1, 0)
                   + sampleAt(x - 1, y + 1, 0) + sampleAt(x + 1, y + 1, 0))
           - u;
  let lapV = 0.2 * (sampleAt(x - 1, y, 1) + sampleAt(x + 1, y, 1)
                  + sampleAt(x, y - 1, 1) + sampleAt(x, y + 1, 1))
           + 0.05 * (sampleAt(x - 1, y - 1, 1) + sampleAt(x + 1, y - 1, 1)
                   + sampleAt(x - 1, y + 1, 1) + sampleAt(x + 1, y + 1, 1))
           - v;

  let uvv = u * v * v;
  let du = params.diffU * lapU - uvv + params.feed * (1.0 - u);
  let dv = params.diffV * lapV + uvv - (params.feed + params.kill) * v;
  setCell(x, y, 0, clamp(u + du * params.dt, 0.0, 1.0));
  setCell(x, y, 1, clamp(v + dv * params.dt, 0.0, 1.0));`,
    };
  }

  setFeed(v: number): void {
    this.set("feed", v);
  }

  getFeed(): number {
    return this.get("feed");
  }

  setKill(v: number): void {
    this.set("kill", v);
  }

  getKill(): number {
    return this.get("kill");
  }

  setDiffU(v: number): void {
    this.set("diffU", v);
  }

  getDiffU(): number {
    return this.get("diffU");
  }

  setDiffV(v: number): void {
    this.set("diffV", v);
  }

  getDiffV(): number {
    return this.get("diffV");
  }

  setDt(v: number): void {
    this.set("dt", v);
  }

  getDt(): number {
    return this.get("dt");
  }
}
