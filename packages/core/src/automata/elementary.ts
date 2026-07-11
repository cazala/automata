/**
 * Elementary — 1D Wolfram cellular automata (rules 0–255)
 *
 * The grid is used as a 2D image where row y is generation y. Each step the engine
 * advances a `currentRow` uniform (see AutomatonDescriptor.advancesRow); only that
 * row is recomputed from the row above via the 3-neighbor Wolfram rule, and every
 * other row is copied unchanged. Seed a single cell on row 0 and watch the classic
 * fractal patterns fill downward.
 */

import {
  Automaton,
  type AutomatonDescriptor,
  type ParamSpec,
  type SeedOptions,
} from "../automaton";

export interface ElementaryOptions {
  rule?: number;
}

export class Elementary extends Automaton {
  readonly name = "elementary";

  static readonly PARAMS: ParamSpec[] = [
    { name: "rule", type: "u32", default: 30, min: 0, max: 255 },
  ];

  /** Rules with visually interesting histories. */
  static readonly PRESETS: number[] = [30, 54, 60, 73, 90, 99, 101, 110, 150, 169, 250, 254];

  static readonly recommendedStepsPerSecond = 120;

  constructor(options: ElementaryOptions = {}) {
    super(Elementary.PARAMS);
    this.configure(options);
  }

  build(): AutomatonDescriptor {
    return {
      channels: 1,
      advancesRow: true,
      params: Elementary.PARAMS,
      step: /* wgsl */ `
  if (y == i32(sim.currentRow)) {
    let l = sampleAt(x - 1, y - 1, 0);
    let c = sampleAt(x,     y - 1, 0);
    let r = sampleAt(x + 1, y - 1, 0);
    let li = select(0u, 1u, l > 0.5);
    let ci = select(0u, 1u, c > 0.5);
    let ri = select(0u, 1u, r > 0.5);
    let idx = (li << 2u) | (ci << 1u) | ri;
    let bit = (params.rule >> idx) & 1u;
    setCell(x, y, 0, f32(bit));
  } else {
    setCell(x, y, 0, sampleAt(x, y, 0));
  }`,
    };
  }

  /** A single live cell at the top-center, whatever the mode. */
  seed(width: number, height: number, _options: SeedOptions = {}): Float32Array {
    const data = new Float32Array(width * height);
    data[Math.floor(width / 2)] = 1;
    return data;
  }

  setRule(rule: number): void {
    this.set("rule", rule);
  }

  getRule(): number {
    return this.get("rule");
  }
}
