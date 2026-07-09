/**
 * Elementary — 1D Wolfram cellular automata (rules 0–255)
 *
 * The grid is used as a 2D image where row y is generation y. Each step the engine
 * advances a `currentRow` uniform (see AutomatonDescriptor.advancesRow); only that
 * row is recomputed from the row above via the 3-neighbor Wolfram rule, and every
 * other row is copied unchanged. Seed a single cell on row 0 and watch the classic
 * fractal patterns fill downward.
 */

import { Automaton, type AutomatonDescriptor } from "../automaton";

export interface ElementaryOptions {
  rule?: number;
}

export class Elementary extends Automaton {
  readonly name = "elementary";

  constructor(options: ElementaryOptions = {}) {
    super();
    this.values.rule = (options.rule ?? 30) & 255;
  }

  build(): AutomatonDescriptor {
    return {
      channels: 1,
      advancesRow: true,
      params: [{ name: "rule", type: "u32", default: 30 }],
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

  setRule(rule: number): void {
    this.set("rule", rule & 255);
  }

  getRule(): number {
    return this.get("rule");
  }
}
