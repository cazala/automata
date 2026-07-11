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
 * u=1, v=0 (fed, no catalyst), so `seed()` produces that field plus ragged
 * patches of V and faint noise — a perfectly symmetric, noiseless start
 * freezes into round spots that never divide (verified empirically).
 */

import {
  Automaton,
  type AutomatonDescriptor,
  type ParamSpec,
  type SeedOptions,
} from "../automaton";

export interface ReactionDiffusionOptions {
  feed?: number;
  kill?: number;
  diffU?: number;
  diffV?: number;
  dt?: number;
}

export interface RDPreset {
  label: string;
  feed: number;
  kill: number;
}

export class ReactionDiffusion extends Automaton {
  readonly name = "reaction-diffusion";

  static readonly PARAMS: ParamSpec[] = [
    { name: "feed", type: "f32", default: 0.0545, min: 0.005, max: 0.12 },
    { name: "kill", type: "f32", default: 0.062, min: 0.03, max: 0.08 },
    { name: "diffU", type: "f32", default: 1.0, min: 0.2, max: 1.2 },
    { name: "diffV", type: "f32", default: 0.5, min: 0.1, max: 0.8 },
    { name: "dt", type: "f32", default: 1.0, min: 0.2, max: 1.2 },
  ];

  /** Classic Gray-Scott (feed, kill) operating points. */
  static readonly PRESETS: Record<string, RDPreset> = {
    coral: { label: "Coral growth", feed: 0.0545, kill: 0.062 },
    mitosis: { label: "Mitosis", feed: 0.0367, kill: 0.0649 },
    solitons: { label: "Solitons", feed: 0.03, kill: 0.062 },
    worms: { label: "Worms", feed: 0.046, kill: 0.063 },
    waves: { label: "Waves", feed: 0.014, kill: 0.045 },
  };

  static readonly recommendedStepsPerSecond = 1000;

  constructor(options: ReactionDiffusionOptions = {}) {
    super(ReactionDiffusion.PARAMS);
    this.configure(options);
  }

  /** Apply a named preset's (feed, kill) operating point. */
  applyPreset(name: keyof typeof ReactionDiffusion.PRESETS): void {
    const preset = ReactionDiffusion.PRESETS[name];
    this.set("feed", preset.feed);
    this.set("kill", preset.kill);
  }

  build(): AutomatonDescriptor {
    return {
      channels: 2,
      // Chemical U idles at 1 and dips where patterns form; inverting the
      // palette renders the empty field dark and the patterns light.
      render: { colorMode: 0, invertPalette: true },
      params: ReactionDiffusion.PARAMS,
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

  /**
   * Fed idle field (u=1) with faint V noise and ragged V patches. `density`
   * scales the patch count; "center" plants a single patch; "clear" is the
   * bare idle field (all-zero cells are inert for Gray-Scott, so even clear
   * must set u=1).
   */
  seed(width: number, height: number, options: SeedOptions = {}): Float32Array {
    const { mode = "random", density = 0.2 } = options;
    const data = new Float32Array(width * height * 2);
    for (let i = 0; i < width * height; i++) {
      data[i * 2] = 1;
      data[i * 2 + 1] = Math.random() * 0.02;
    }
    const patch = (sx: number, sy: number, size: number) => {
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          if (Math.random() < 0.25) continue; // ragged edge
          const px = (sx + dx + width) % width;
          const py = (sy + dy + height) % height;
          data[(py * width + px) * 2 + 1] = 1;
        }
      }
    };
    if (mode === "center") {
      patch(Math.floor(width / 2) - 4, Math.floor(height / 2) - 4, 8);
    } else if (mode !== "clear") {
      const count = Math.max(1, Math.round(density * 40));
      for (let i = 0; i < count; i++) {
        patch(
          Math.floor(Math.random() * width),
          Math.floor(Math.random() * height),
          6
        );
      }
    }
    return data;
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
