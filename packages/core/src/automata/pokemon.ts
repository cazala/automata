/**
 * Pokemon — a multi-state "type battle" cellular automaton
 *
 * Every cell is one of the 18 pokemon types. Each step, a cell battles its 8
 * neighbours: neighbours whose type is super-effective against the cell's type
 * are counted per attacking type, and if the strongest attacking type has at
 * least `threshold` cells, the cell is converted to that type. Uniform regions
 * are stable, so battles happen along borders, where regions eat into each
 * other along the type chart's many cycles (fire > grass > water > fire, ...).
 *
 * Seeding matters: `seed()` produces a voronoi mosaic of single-type regions
 * (jittered-grid Worley sites). Uncorrelated per-cell noise deadlocks at
 * threshold 3 because no cell ever sees 3 aligned attackers, while coherent
 * domains give straight borders where the battle rule stays active.
 *
 * Cell layout is 4 channels: [r, g, b, typeIndex]. The compute shader writes
 * the canonical type color into rgb every step, so the raw-rgb render mode
 * displays it without a palette lookup.
 */

import {
  Automaton,
  type AutomatonDescriptor,
  type ParamSpec,
  type SeedOptions,
} from "../automaton";

export interface PokemonTypeInfo {
  name: string;
  /** Canonical type color, 0-255 sRGB. */
  color: [number, number, number];
}

export const POKEMON_TYPES: PokemonTypeInfo[] = [
  { name: "Normal", color: [168, 168, 120] },
  { name: "Fire", color: [240, 128, 48] },
  { name: "Water", color: [104, 144, 240] },
  { name: "Electric", color: [248, 208, 48] },
  { name: "Grass", color: [120, 200, 80] },
  { name: "Ice", color: [152, 216, 216] },
  { name: "Fighting", color: [192, 48, 40] },
  { name: "Poison", color: [160, 64, 160] },
  { name: "Ground", color: [224, 192, 104] },
  { name: "Flying", color: [168, 144, 240] },
  { name: "Psychic", color: [248, 88, 136] },
  { name: "Bug", color: [168, 184, 32] },
  { name: "Rock", color: [184, 160, 56] },
  { name: "Ghost", color: [112, 88, 152] },
  { name: "Dragon", color: [112, 56, 248] },
  { name: "Dark", color: [112, 88, 72] },
  { name: "Steel", color: [184, 184, 208] },
  { name: "Fairy", color: [238, 153, 172] },
];

export const POKEMON_TYPE_COUNT = POKEMON_TYPES.length;

/** attacker -> defenders the attacker is super-effective against (by name). */
const SUPER_EFFECTIVE: Record<string, string[]> = {
  Normal: [],
  Fire: ["Grass", "Ice", "Bug", "Steel"],
  Water: ["Fire", "Ground", "Rock"],
  Electric: ["Water", "Flying"],
  Grass: ["Water", "Ground", "Rock"],
  Ice: ["Grass", "Ground", "Flying", "Dragon"],
  Fighting: ["Normal", "Ice", "Rock", "Dark", "Steel"],
  Poison: ["Grass", "Fairy"],
  Ground: ["Fire", "Electric", "Poison", "Rock", "Steel"],
  Flying: ["Grass", "Fighting", "Bug"],
  Psychic: ["Fighting", "Poison"],
  Bug: ["Grass", "Psychic", "Dark"],
  Rock: ["Fire", "Ice", "Flying", "Bug"],
  Ghost: ["Psychic", "Ghost"],
  Dragon: ["Dragon"],
  Dark: ["Psychic", "Ghost"],
  Steel: ["Ice", "Rock", "Fairy"],
  Fairy: ["Fighting", "Dragon", "Dark"],
};

function buildBeatsMatrix(): Float32Array {
  const n = POKEMON_TYPE_COUNT;
  const index = new Map(POKEMON_TYPES.map((t, i) => [t.name, i]));
  const m = new Float32Array(n * n);
  for (const [attacker, defenders] of Object.entries(SUPER_EFFECTIVE)) {
    const a = index.get(attacker)!;
    for (const d of defenders) m[a * n + index.get(d)!] = 1;
  }
  return m;
}

function buildPalette(): Float32Array {
  const p = new Float32Array(POKEMON_TYPE_COUNT * 3);
  POKEMON_TYPES.forEach((t, i) => {
    p[i * 3] = t.color[0] / 255;
    p[i * 3 + 1] = t.color[1] / 255;
    p[i * 3 + 2] = t.color[2] / 255;
  });
  return p;
}

export interface PokemonOptions {
  /** Neighbours of a single attacking type needed to convert a cell (1-3). */
  threshold?: number;
  /** Approximate size (cells) of the voronoi regions the grid seeds as. */
  regionSize?: number;
  /** Per-type participation flags (indexed like POKEMON_TYPES). */
  enabledTypes?: boolean[];
}

export class Pokemon extends Automaton {
  readonly name = "pokemon";

  static readonly PARAMS: ParamSpec[] = [
    { name: "threshold", type: "u32", default: 3, min: 1, max: 3 },
  ];

  static readonly recommendedStepsPerSecond = 100;

  private regionSize: number;
  private enabledTypes: boolean[];

  constructor(options: PokemonOptions = {}) {
    super(Pokemon.PARAMS);
    this.configure(options);
    this.regionSize = Math.max(2, Math.floor(options.regionSize ?? 4));
    this.enabledTypes =
      options.enabledTypes?.length === POKEMON_TYPE_COUNT
        ? [...options.enabledTypes]
        : new Array(POKEMON_TYPE_COUNT).fill(true);
  }

  build(): AutomatonDescriptor {
    const N = POKEMON_TYPE_COUNT;
    return {
      channels: 4,
      render: { colorMode: 2 },
      params: Pokemon.PARAMS,
      storages: [
        { name: "beats", data: buildBeatsMatrix() },
        { name: "palette", data: buildPalette() },
      ],
      step: /* wgsl */ `
  let myType = i32(round(sampleAt(x, y, 3)));
  var counts: array<i32, ${N}>;
  for (var i: i32 = 0; i < ${N}; i = i + 1) { counts[i] = 0; }
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      if (dx == 0 && dy == 0) { continue; }
      let t = i32(round(sampleAt(x + dx, y + dy, 3)));
      if (beats[t * ${N} + myType] > 0.5) {
        counts[t] = counts[t] + 1;
      }
    }
  }
  var newType = myType;
  var bestCount = 0;
  for (var i: i32 = 0; i < ${N}; i = i + 1) {
    if (counts[i] > bestCount) {
      bestCount = counts[i];
      newType = i;
    }
  }
  if (bestCount < i32(params.threshold)) {
    newType = myType;
  }
  setCell(x, y, 0, palette[newType * 3]);
  setCell(x, y, 1, palette[newType * 3 + 1]);
  setCell(x, y, 2, palette[newType * 3 + 2]);
  setCell(x, y, 3, f32(newType));`,
    };
  }

  /**
   * Voronoi mosaic of single-type regions using jittered-grid Worley sites
   * with toroidal distance (regions tile seamlessly across the wrap).
   * Disabled types are excluded from the pool and can never re-emerge, since
   * cells only ever convert to a neighbour's type.
   */
  seed(width: number, height: number, _options: SeedOptions = {}): Float32Array {
    const pool: number[] = [];
    for (let t = 0; t < POKEMON_TYPE_COUNT; t++) {
      if (this.enabledTypes[t]) pool.push(t);
    }
    if (pool.length === 0) pool.push(0);

    const S = Math.max(2, Math.floor(this.regionSize));
    const bw = Math.max(1, Math.ceil(width / S));
    const bh = Math.max(1, Math.ceil(height / S));
    const siteX = new Float32Array(bw * bh);
    const siteY = new Float32Array(bw * bh);
    const siteT = new Uint8Array(bw * bh);
    for (let i = 0; i < bw * bh; i++) {
      siteX[i] = ((i % bw) + Math.random()) * S;
      siteY[i] = (Math.floor(i / bw) + Math.random()) * S;
      siteT[i] = pool[Math.floor(Math.random() * pool.length)];
    }

    const data = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const by = Math.floor(y / S);
      for (let x = 0; x < width; x++) {
        const bx = Math.floor(x / S);
        let best = Infinity;
        let t = pool[0];
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nbx = (bx + ox + bw) % bw;
            const nby = (by + oy + bh) % bh;
            const i = nby * bw + nbx;
            let dx = x - siteX[i];
            let dy = y - siteY[i];
            dx -= Math.round(dx / width) * width;
            dy -= Math.round(dy / height) * height;
            const d = dx * dx + dy * dy;
            if (d < best) {
              best = d;
              t = siteT[i];
            }
          }
        }
        const [r, g, b] = POKEMON_TYPES[t].color;
        const base = (y * width + x) * 4;
        data[base] = r / 255;
        data[base + 1] = g / 255;
        data[base + 2] = b / 255;
        data[base + 3] = t;
      }
    }
    return data;
  }

  setThreshold(n: number): void {
    this.set("threshold", n);
  }

  getThreshold(): number {
    return this.get("threshold");
  }

  /** Region size only affects the next seed(); no rebuild needed. */
  setRegionSize(n: number): void {
    this.regionSize = Math.max(2, Math.floor(n));
  }

  getRegionSize(): number {
    return this.regionSize;
  }

  /** Type participation only affects the next seed(); no rebuild needed. */
  setEnabledTypes(enabled: boolean[]): void {
    if (enabled.length === POKEMON_TYPE_COUNT) this.enabledTypes = [...enabled];
  }

  getEnabledTypes(): boolean[] {
    return [...this.enabledTypes];
  }
}
