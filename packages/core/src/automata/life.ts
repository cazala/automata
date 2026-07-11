/**
 * Life — 2D life-like cellular automata (Conway's Game of Life and generalizations)
 *
 * A single-channel Moore-neighborhood automaton. Birth and survival rules are
 * expressed as 9-bit masks (bit n set = "n live neighbors triggers birth/survival"),
 * so any life-like rule is representable:
 *   Conway  B3/S23   -> birth 0b000001000 (8),   survival 0b000001100 (12)
 *   HighLife B36/S23 -> birth 0b001001000 (72),  survival 12
 */

import {
  Automaton,
  type AutomatonDescriptor,
  type ParamSpec,
  type SeedOptions,
} from "../automaton";

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

export interface LifePreset {
  label: string;
  birth: number[];
  survival: number[];
  /** Soup density this rule develops best from. */
  density: number;
}

export class Life extends Automaton {
  readonly name = "life";

  static readonly PARAMS: ParamSpec[] = [
    { name: "birth", type: "u32", default: countsToMask([3]), min: 0, max: 511 },
    { name: "survival", type: "u32", default: countsToMask([2, 3]), min: 0, max: 511 },
  ];

  /** Named rules with the soup density each develops best from. */
  static readonly PRESETS: Record<string, LifePreset> = {
    conway: { label: "Conway", birth: [3], survival: [2, 3], density: 0.5 },
    daynight: {
      label: "Day & Night",
      birth: [3, 6, 7, 8],
      survival: [3, 4, 6, 7, 8],
      density: 0.5,
    },
    maze: { label: "Maze", birth: [3], survival: [1, 2, 3, 4, 5], density: 0.02 },
    coral: { label: "Coral", birth: [3], survival: [4, 5, 6, 7, 8], density: 0.45 },
  };

  static readonly recommendedStepsPerSecond = 120;

  constructor(options: LifeOptions = {}) {
    super(Life.PARAMS);
    this.configure(options);
  }

  build(): AutomatonDescriptor {
    return {
      channels: 1,
      params: Life.PARAMS,
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

  /** Random soup at `density` (default 0.5); "center" plants a small cluster. */
  seed(width: number, height: number, options: SeedOptions = {}): Float32Array {
    const { mode = "random", density = 0.5 } = options;
    const data = new Float32Array(width * height);
    if (mode === "clear") return data;
    if (mode === "center") {
      const cx = Math.floor(width / 2);
      const cy = Math.floor(height / 2);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [-1, -1]]) {
        data[(cy + dy) * width + (cx + dx)] = 1;
      }
      return data;
    }
    for (let i = 0; i < data.length; i++) {
      if (Math.random() < density) data[i] = 1;
    }
    return data;
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
