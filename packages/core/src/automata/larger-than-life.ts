/**
 * LargerThanLife — range-based cellular automata with large Moore neighborhoods.
 *
 * This is the "Larger than Life" generalization of Life:
 *
 *   - radius R samples a (2R + 1) square, excluding the center cell;
 *   - inclusive birth and survival ranges replace Life's 9-bit masks;
 *   - C states use one live state plus C - 2 visible refractory/cooldown states.
 *
 * Cell values stay in one normalized channel. A live cell is 1, a ready/dead
 * cell is 0, and refractory states step evenly down through (0, 1). Only fully
 * live cells count as neighbors, and refractory cells cannot be born again
 * until their cooldown reaches zero.
 */

import {
  Automaton,
  type AutomatonDescriptor,
  type ParamSpec,
  type SeedOptions,
} from "../automaton";

export const LARGER_THAN_LIFE_MIN_RADIUS = 1;
export const LARGER_THAN_LIFE_MAX_RADIUS = 12;
export const LARGER_THAN_LIFE_MIN_STATES = 2;
export const LARGER_THAN_LIFE_MAX_STATES = 32;

const MAX_NEIGHBORS =
  (LARGER_THAN_LIFE_MAX_RADIUS * 2 + 1) ** 2 - 1;

export interface NeighborRange {
  /** Inclusive lower neighbor count. */
  min: number;
  /** Inclusive upper neighbor count. */
  max: number;
}

export interface LargerThanLifeOptions {
  /** Moore-neighborhood radius (1-12, default 5). Rebuilds on change. */
  radius?: number;
  /** Total states: dead + alive + optional refractory states (2-32). */
  states?: number;
  /** Inclusive neighbor-count range that births a ready/dead cell. */
  birth?: NeighborRange;
  /** Inclusive neighbor-count range that keeps a live cell alive. */
  survival?: NeighborRange;
}

export interface LargerThanLifePreset {
  label: string;
  radius: number;
  states: number;
  birth: NeighborRange;
  survival: NeighborRange;
  /** Soup density this rule develops best from. */
  density: number;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, value)));
}

export function largerThanLifeNeighborCount(radius: number): number {
  const r = clampInteger(
    radius,
    LARGER_THAN_LIFE_MIN_RADIUS,
    LARGER_THAN_LIFE_MAX_RADIUS
  );
  return (r * 2 + 1) ** 2 - 1;
}

function normalizeRange(range: NeighborRange, max: number): NeighborRange {
  const a = clampInteger(range.min, 0, max);
  const b = clampInteger(range.max, 0, max);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

export class LargerThanLife extends Automaton {
  readonly name = "larger-than-life";

  static readonly PARAMS: ParamSpec[] = [
    { name: "states", type: "u32", default: 2, min: 2, max: 32 },
    { name: "birthMin", type: "u32", default: 34, min: 0, max: MAX_NEIGHBORS },
    { name: "birthMax", type: "u32", default: 45, min: 0, max: MAX_NEIGHBORS },
    { name: "survivalMin", type: "u32", default: 33, min: 0, max: MAX_NEIGHBORS },
    { name: "survivalMax", type: "u32", default: 57, min: 0, max: MAX_NEIGHBORS },
  ];

  /** Named binary and multistate rules with suitable soup densities. */
  static readonly PRESETS: Record<string, LargerThanLifePreset> = {
    bosco: {
      label: "Bosco",
      radius: 5,
      states: 2,
      birth: { min: 34, max: 45 },
      survival: { min: 33, max: 57 },
      density: 0.4,
    },
    boscoTrails: {
      label: "Bosco Trails",
      radius: 5,
      states: 6,
      birth: { min: 34, max: 45 },
      survival: { min: 33, max: 57 },
      density: 0.4,
    },
    majority: {
      label: "Majority",
      radius: 4,
      states: 2,
      birth: { min: 41, max: 80 },
      survival: { min: 40, max: 80 },
      density: 0.5,
    },
    waffle: {
      label: "Waffle",
      radius: 7,
      states: 2,
      birth: { min: 75, max: 170 },
      survival: { min: 99, max: 199 },
      density: 0.35,
    },
    glowingCoral: {
      label: "Glowing Coral",
      radius: 3,
      states: 8,
      birth: { min: 10, max: 14 },
      survival: { min: 8, max: 18 },
      density: 0.28,
    },
  };

  static readonly recommendedStepsPerSecond = 30;

  private radius: number;

  constructor(options: LargerThanLifeOptions = {}) {
    super(LargerThanLife.PARAMS);
    this.radius = clampInteger(
      options.radius ?? 5,
      LARGER_THAN_LIFE_MIN_RADIUS,
      LARGER_THAN_LIFE_MAX_RADIUS
    );
    this.setStates(options.states ?? 2);
    this.setBirthRange(options.birth ?? { min: 34, max: 45 });
    this.setSurvivalRange(options.survival ?? { min: 33, max: 57 });
  }

  build(): AutomatonDescriptor {
    const R = this.radius;
    return {
      channels: 1,
      params: LargerThanLife.PARAMS,
      render: { colorMode: 0 },
      step: /* wgsl */ `
  let current = sampleAt(x, y, 0);
  let alive = current > 0.999;
  var count = 0u;
  for (var dy: i32 = -${R}; dy <= ${R}; dy = dy + 1) {
    for (var dx: i32 = -${R}; dx <= ${R}; dx = dx + 1) {
      if (dx != 0 || dy != 0) {
        count = count + select(0u, 1u, sampleAt(x + dx, y + dy, 0) > 0.999);
      }
    }
  }

  let born = count >= params.birthMin && count <= params.birthMax;
  let survives = count >= params.survivalMin && count <= params.survivalMax;
  let cooldownStep = 1.0 / f32(params.states - 1u);
  var next = 0.0;

  if (alive) {
    if (survives) {
      next = 1.0;
    } else if (params.states > 2u) {
      next = 1.0 - cooldownStep;
    }
  } else if (current > 0.0) {
    next = max(0.0, current - cooldownStep);
  } else if (born) {
    next = 1.0;
  }

  setCell(x, y, 0, next);`,
    };
  }

  /**
   * Random live/dead soup at `density` (default 0.4). Center mode plants a
   * neighborhood-scale patch so large-range birth thresholds can activate.
   */
  seed(width: number, height: number, options: SeedOptions = {}): Float32Array {
    const { mode = "random", density = 0.4 } = options;
    const data = new Float32Array(width * height);
    if (mode === "clear") return data;

    if (mode === "center") {
      const cx = Math.floor(width / 2);
      const cy = Math.floor(height / 2);
      const half = Math.max(2, this.radius * 2);
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          if (dx * dx + dy * dy > half * half) continue;
          const px = (cx + dx + width) % width;
          const py = (cy + dy + height) % height;
          data[py * width + px] = 1;
        }
      }
      return data;
    }

    const soupDensity = Math.max(0, Math.min(1, density));
    for (let i = 0; i < data.length; i++) {
      if (Math.random() < soupDensity) data[i] = 1;
    }
    return data;
  }

  // ---- structural -----------------------------------------------------------

  setRadius(value: number): void {
    const radius = clampInteger(
      value,
      LARGER_THAN_LIFE_MIN_RADIUS,
      LARGER_THAN_LIFE_MAX_RADIUS
    );
    if (radius === this.radius) return;
    this.radius = radius;

    // Keep current ranges valid when the neighborhood shrinks.
    this.setBirthRange(this.getBirthRange());
    this.setSurvivalRange(this.getSurvivalRange());
    this.requestRebuild();
  }

  getRadius(): number {
    return this.radius;
  }

  getMaxNeighbors(): number {
    return largerThanLifeNeighborCount(this.radius);
  }

  // ---- realtime -------------------------------------------------------------

  setStates(value: number): void {
    this.set("states", value);
  }

  getStates(): number {
    return this.get("states");
  }

  setBirthRange(range: NeighborRange): void {
    const next = normalizeRange(range, this.getMaxNeighbors());
    this.set("birthMin", next.min);
    this.set("birthMax", next.max);
  }

  getBirthRange(): NeighborRange {
    return { min: this.get("birthMin"), max: this.get("birthMax") };
  }

  setSurvivalRange(range: NeighborRange): void {
    const next = normalizeRange(range, this.getMaxNeighbors());
    this.set("survivalMin", next.min);
    this.set("survivalMax", next.max);
  }

  getSurvivalRange(): NeighborRange {
    return { min: this.get("survivalMin"), max: this.get("survivalMax") };
  }
}
