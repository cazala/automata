# Writing custom automata

You don't need to fork this library to create a new cellular automaton. An
automaton is a small object: some WGSL for the per-cell update, declared
parameters, and (optionally) storages, render hints, and a seeding function.

## The quick way: `createAutomaton`

```ts
import { createAutomaton, Engine } from "@cazala/automata";

const majority = createAutomaton({
  name: "majority",
  channels: 1,
  params: [{ name: "bias", type: "f32", default: 0.0, min: -1, max: 1 }],
  step: /* wgsl */ `
    var n = 0.0;
    for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
      for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
        n = n + sampleAt(x + dx, y + dy, 0);
      }
    }
    // twisted majority vote: smooths noise into blobby domains
    setCell(x, y, 0, select(0.0, 1.0, n + params.bias > 4.5));
  `,
});

const engine = new Engine({ canvas, automaton: majority });
await engine.initialize();
engine.reset({ density: 0.5 });
engine.play();

majority.set("bias", 0.2); // realtime, clamped to the declared range
```

For anything with instance state (baked constants, generated weights, tables),
subclass `Automaton` instead — every built-in rule in
[`src/automata/`](../packages/core/src/automata) is a worked example, from
~70 lines (`brain.ts`) to ~380 (`neural.ts`).

## The WGSL contract

Your `step` string is the body of a compute-shader function invoked once per
cell, with these in scope:

| Symbol | Meaning |
| --- | --- |
| `x`, `y` | this cell's coords (`i32`) |
| `sampleAt(x, y, c) -> f32` | read channel `c` of any cell from the *previous* state (wraps or clamps per grid config) |
| `setCell(x, y, c, v)` | write channel `c` of the *next* state (write your own cell) |
| `params.<name>` | your declared params (uniforms) |
| `sim.width`, `sim.height`, `sim.channels` | grid dims (`u32`) |
| `sim.frame`, `sim.seed` | step counter and a per-step hash seed (`u32`) |
| `sim.currentRow` | for `advancesRow` rules (see elementary) |
| `rand01(seed: u32) -> f32` | hash-based uniform random; combine `x`, `y`, `sim.seed` |
| `cellBase(x, y) -> i32` | flat index helper |

Reads always come from the previous buffer and writes go to the next
(ping-pong), so update order never matters. **Write every channel of your
cell every step** — unwritten channels are whatever was in the destination
buffer from two steps ago, which is rarely what you want.

`globals` lets you inject helper functions/structs above the entrypoint (see
Neural's `activate()` or Cyclic's hue wheel).

## Declared params

```ts
params: [{ name: "feed", type: "f32", default: 0.0545, min: 0.005, max: 0.12 }]
```

- Single source of truth: defaults initialize the automaton, `set()` clamps to
  the range, `paramSpecs` is public so UIs can generate sliders.
- Updating a param is a uniform write — realtime, no pipeline rebuild.
- Types: `f32`, `u32`, `i32` (integer types are rounded on set).
- **Pitfall**: WGSL will not compare `u32` against a float literal. If you
  declare `{ type: "u32" }`, write `params.flag == 1u`, not
  `params.flag > 0.5`. (This exact bug shipped once as an invisible frozen
  simulation — which is why the engine now reports compile errors via
  `onError`.)

## Storages

Read-only `Float32Array` lookup tables bound as storage buffers — neural
weights, the pokemon type chart, Lenia's kernel:

```ts
storages: [{ name: "weights", data: myFloat32Array }]
// WGSL: weights[i]
```

Storage contents can be updated in place without a rebuild via
`engine.updateStorage(name, data)` — but a *size* change needs a rebuild
(subclass + `requestRebuild()`).

## Structural constants

Anything baked into the WGSL string (loop bounds, channel counts) can't be a
param. Make it instance state in a subclass and call `this.requestRebuild()`
from its setter — the engine reallocates and recompiles. See `Lenia.setRadius`.

## Render hints

```ts
render: { colorMode: 1, invertPalette: false }
```

- `colorMode 0` — channel 0 through the user's colorOff→colorOn gradient.
- `colorMode 1` — channels 0..2 each through the gradient (palette-tinted, hue-preserving).
- `colorMode 2` — channels 0..2 as raw rgb (your cells carry their own colors;
  see pokemon/cyclic, which write palette colors into channels each step).
- `invertPalette` — for rules whose idle state is a *high* value (Gray-Scott).

## Seeding

Override `seed(width, height, options)` to return the initial state your rule
develops well from. Do not skip this thought: several classic rules die or
freeze from naive uniform noise (see the war stories in
[automata.md](automata.md) — Gray-Scott needs ragged noisy patches, pokemon
needs coherent voronoi domains, Lenia needs kernel-scale blobs). Honor
`mode: "clear" | "center" | "random" | "noise"` where they make sense.

## Flicker and `stepParity`

If your rule oscillates between two phases on alternating steps (common for
convolutions with negative weights — the texture looks like a blinking
checkerboard when you single-step), set `stepParity: 2` in the descriptor. The
engine will only advance the simulation an even number of steps per rendered
frame, so the display always samples the same phase. Diagnose it by comparing
states: if `|state(t) - state(t+2)|` is much smaller than
`|state(t) - state(t+1)|`, you have a period-2 rule.

## Debugging checklist

1. **Frozen simulation?** Check the console — shader compile errors arrive at
   `EngineOptions.onError` (default `console.error`) with line numbers.
2. **Verify numerically**, not visually: `await engine.getCells()` gives you
   the raw grid for asserting invariants from the console or tests.
3. **Black screen but no errors?** Check your render hints against what your
   channels actually hold (e.g. values near 0 with a dark colorOff).
4. `engine.step()` while paused = deterministic single-stepping.
