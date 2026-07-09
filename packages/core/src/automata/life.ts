/**
 * Life — 2D life-like cellular automata (Conway's Game of Life and generalizations)
 *
 * A single-channel Moore-neighborhood automaton. Birth and survival rules are
 * expressed as 9-bit masks (bit n set = "n live neighbors triggers birth/survival"),
 * so any life-like rule is representable:
 *   Conway  B3/S23   -> birth 0b000001000 (8),   survival 0b000001100 (12)
 *   HighLife B36/S23 -> birth 0b001001000 (72),  survival 12
 */

import { Automaton, type AutomatonDescriptor } from "../automaton";

export interface LifeOptions {
  birth?: number;
  survival?: number;
}

/** Convert a list of neighbor counts to a 9-bit mask. */
export function countsToMask(counts: number[]): number {
  return counts.reduce((m, c) => m | (1 << c), 0);
}

/** Convert a 9-bit mask back to the list of neighbor counts. */
export function maskToCounts(mask: number): number[] {
  const out: number[] = [];
  for (let c = 0; c <= 8; c++) if (mask & (1 << c)) out.push(c);
  return out;
}

export class Life extends Automaton {
  readonly name = "life";

  constructor(options: LifeOptions = {}) {
    super();
    this.values.birth = options.birth ?? countsToMask([3]);
    this.values.survival = options.survival ?? countsToMask([2, 3]);
  }

  build(): AutomatonDescriptor {
    return {
      channels: 1,
      params: [
        { name: "birth", type: "u32", default: countsToMask([3]) },
        { name: "survival", type: "u32", default: countsToMask([2, 3]) },
      ],
      step: /* wgsl */ `
  let alive = sampleAt(x, y, 0);
  var n = 0.0;
  n = n + sampleAt(x - 1, y - 1, 0);
  n = n + sampleAt(x,     y - 1, 0);
  n = n + sampleAt(x + 1, y - 1, 0);
  n = n + sampleAt(x - 1, y,     0);
  n = n + sampleAt(x + 1, y,     0);
  n = n + sampleAt(x - 1, y + 1, 0);
  n = n + sampleAt(x,     y + 1, 0);
  n = n + sampleAt(x + 1, y + 1, 0);
  let count = u32(n + 0.5);
  let bit = 1u << count;
  var next = 0.0;
  if (alive > 0.5) {
    if ((params.survival & bit) != 0u) { next = 1.0; }
  } else {
    if ((params.birth & bit) != 0u) { next = 1.0; }
  }
  setCell(x, y, 0, next);`,
    };
  }

  setBirth(mask: number): void {
    this.set("birth", mask >>> 0);
  }

  setSurvival(mask: number): void {
    this.set("survival", mask >>> 0);
  }

  getBirth(): number {
    return this.get("birth");
  }

  getSurvival(): number {
    return this.get("survival");
  }
}
