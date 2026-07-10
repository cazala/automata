/**
 * Pokemon — a multi-state "type battle" cellular automaton
 *
 * Every cell is one of the 18 pokemon types. Each step, a cell battles its 8
 * neighbours: neighbours whose type is super-effective against the cell's type
 * are counted per attacking type, and if the strongest attacking type has at
 * least `threshold` cells, the cell is converted to that type. Same-type
 * neighbours never convert (a type is never super-effective against itself in
 * a way that changes anything — converting to your own type is a no-op), so
 * uniform regions are stable and battles happen along the borders, where
 * regions eat into each other along the type chart's many cycles
 * (fire > grass > water > fire, ...). From a random start the field is pure
 * noise that self-organizes into warring domains.
 *
 * Cell layout is 4 channels: [r, g, b, typeIndex]. The compute shader writes
 * the canonical type color into rgb every step, so the standard multi-channel
 * render path displays it without a palette lookup.
 */

import { Automaton, type AutomatonDescriptor } from "../automaton";

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
}

export class Pokemon extends Automaton {
  readonly name = "pokemon";

  constructor(options: PokemonOptions = {}) {
    super();
    this.values.threshold = Math.max(1, Math.min(3, Math.floor(options.threshold ?? 2)));
  }

  build(): AutomatonDescriptor {
    const N = POKEMON_TYPE_COUNT;
    return {
      channels: 4,
      params: [{ name: "threshold", type: "u32", default: 2 }],
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

  setThreshold(n: number): void {
    this.set("threshold", Math.max(1, Math.min(3, Math.floor(n))));
  }

  getThreshold(): number {
    return this.get("threshold");
  }
}
