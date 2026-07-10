/**
 * BriansBrain — the classic 3-state "electric storm" automaton
 *
 * States: ready (0), firing (1), refractory (0.5). A ready cell fires when
 * exactly `birth` neighbours are firing (classically 2); a firing cell always
 * becomes refractory; a refractory cell always becomes ready. Nothing is ever
 * stable, so from a sparse random start the grid fills with gliders and
 * diagonal waves that never settle.
 *
 * One channel; the 0 / 0.5 / 1 encoding doubles as the display value, giving
 * bright heads with dimmer refractory trails under the standard gradient.
 */

import { Automaton, type AutomatonDescriptor } from "../automaton";

export interface BriansBrainOptions {
  /** Firing neighbours required for a ready cell to fire (default 2). */
  birth?: number;
}

export class BriansBrain extends Automaton {
  readonly name = "brain";

  constructor(options: BriansBrainOptions = {}) {
    super();
    this.values.birth = Math.max(1, Math.min(8, Math.floor(options.birth ?? 2)));
  }

  build(): AutomatonDescriptor {
    return {
      channels: 1,
      params: [{ name: "birth", type: "u32", default: 2 }],
      step: /* wgsl */ `
  let s = sampleAt(x, y, 0);
  var firing = 0u;
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      if (dx == 0 && dy == 0) { continue; }
      if (sampleAt(x + dx, y + dy, 0) > 0.75) { firing = firing + 1u; }
    }
  }
  var next = 0.0;
  if (s > 0.75) {
    next = 0.5; // firing -> refractory
  } else if (s > 0.25) {
    next = 0.0; // refractory -> ready
  } else if (firing == params.birth) {
    next = 1.0; // ready -> firing
  }
  setCell(x, y, 0, next);`,
    };
  }

  setBirth(n: number): void {
    this.set("birth", Math.max(1, Math.min(8, Math.floor(n))));
  }

  getBirth(): number {
    return this.get("birth");
  }
}
