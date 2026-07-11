/**
 * Cyclic — Griffeath's cyclic cellular automaton (rock-paper-scissors spirals)
 *
 * Each cell holds one of N states arranged in a cycle: state s is "eaten" by
 * state (s+1) mod N. A cell advances to the next state when at least
 * `threshold` Moore neighbours already hold it. From uniform noise, defects in
 * the eating fronts wind up into persistent rotating spirals — the classic
 * demo of self-organization from randomness.
 *
 * Cell layout is 4 channels [r, g, b, state]; the shader recolors each cell
 * from a hue wheel (state / states) every step and the raw-rgb render mode
 * displays it directly. Both `states` and `threshold` are realtime uniforms —
 * but shrinking `states` needs a re-seed, since existing cells may hold
 * indices outside the new cycle.
 */

import {
  Automaton,
  type AutomatonDescriptor,
  type ParamSpec,
  type SeedOptions,
} from "../automaton";

export interface CyclicOptions {
  /** Number of states in the cycle (3-20, default 14). */
  states?: number;
  /** Neighbours holding the successor state needed to convert (1-4, default 1). */
  threshold?: number;
}

/** Hue wheel used for both GPU recoloring and CPU-side seeding. */
export function cyclicColor(state: number, states: number): [number, number, number] {
  const h = states > 0 ? state / states : 0;
  const r = Math.min(1, Math.max(0, Math.abs(h * 6 - 3) - 1));
  const g = Math.min(1, Math.max(0, 2 - Math.abs(h * 6 - 2)));
  const b = Math.min(1, Math.max(0, 2 - Math.abs(h * 6 - 4)));
  return [r * 0.9, g * 0.9, b * 0.9];
}

export class Cyclic extends Automaton {
  readonly name = "cyclic";

  static readonly PARAMS: ParamSpec[] = [
    { name: "states", type: "u32", default: 14, min: 3, max: 20 },
    { name: "threshold", type: "u32", default: 1, min: 1, max: 4 },
  ];

  static readonly recommendedStepsPerSecond = 120;

  constructor(options: CyclicOptions = {}) {
    super(Cyclic.PARAMS);
    this.configure(options);
  }

  build(): AutomatonDescriptor {
    return {
      channels: 4,
      render: { colorMode: 2 },
      params: Cyclic.PARAMS,
      globals: /* wgsl */ `
fn cyclicHue(h: f32) -> vec3<f32> {
  let r = clamp(abs(h * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  let g = clamp(2.0 - abs(h * 6.0 - 2.0), 0.0, 1.0);
  let b = clamp(2.0 - abs(h * 6.0 - 4.0), 0.0, 1.0);
  return vec3<f32>(r, g, b) * 0.9;
}`,
      step: /* wgsl */ `
  let n = i32(params.states);
  let s = i32(round(sampleAt(x, y, 3))) % n;
  let successor = (s + 1) % n;
  var count = 0u;
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      if (dx == 0 && dy == 0) { continue; }
      if (i32(round(sampleAt(x + dx, y + dy, 3))) % n == successor) {
        count = count + 1u;
      }
    }
  }
  var next = s;
  if (count >= params.threshold) {
    next = successor;
  }
  let rgb = cyclicHue(f32(next) / f32(n));
  setCell(x, y, 0, rgb.x);
  setCell(x, y, 1, rgb.y);
  setCell(x, y, 2, rgb.z);
  setCell(x, y, 3, f32(next));`,
    };
  }

  /** Uniform random states; spirals wind up from the noise. */
  seed(width: number, height: number, _options: SeedOptions = {}): Float32Array {
    const n = Math.max(3, this.get("states"));
    const data = new Float32Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const st = Math.floor(Math.random() * n);
      const [r, g, b] = cyclicColor(st, n);
      const base = i * 4;
      data[base] = r;
      data[base + 1] = g;
      data[base + 2] = b;
      data[base + 3] = st;
    }
    return data;
  }

  setStates(n: number): void {
    this.set("states", n);
  }

  getStates(): number {
    return this.get("states");
  }

  setThreshold(n: number): void {
    this.set("threshold", n);
  }

  getThreshold(): number {
    return this.get("threshold");
  }
}
