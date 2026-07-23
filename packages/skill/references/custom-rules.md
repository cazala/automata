# Custom automata

Use `createAutomaton(...)` for a local rule defined by a descriptor. Subclass `Automaton` when the rule needs generated storages, structural setters, or custom instance behavior.

## Contents

- Quick custom rule
- WGSL contract
- Declared parameters
- Storage buffers
- Structural state
- Render hints
- Seeding
- Correctness checklist

## Quick custom rule

```ts
import { Engine, createAutomaton } from "@cazala/automata";

const majority = createAutomaton({
  name: "majority",
  channels: 1,
  params: [
    { name: "bias", type: "f32", default: 0, min: -1, max: 1 },
  ],
  step: /* wgsl */ `
    var n = 0.0;
    for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
      for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
        n = n + sampleAt(x + dx, y + dy, 0);
      }
    }
    setCell(x, y, 0, select(0.0, 1.0, n + params.bias > 4.5));
  `,
});

const engine = new Engine({ canvas, automaton: majority });
await engine.initialize();
engine.coverGrid();
engine.reset({ density: 0.5 });
engine.play();
```

## WGSL contract

The `step` string becomes the body of a compute-shader function invoked once per cell. It has:

| Symbol | Meaning |
| --- | --- |
| `x`, `y` | Current cell coordinates as `i32` |
| `sampleAt(x, y, c) -> f32` | Read channel `c` from the previous state |
| `setCell(x, y, c, value)` | Write a channel in the next state |
| `params.<name>` | Declared scalar uniform |
| `sim.width`, `sim.height`, `sim.channels` | Grid dimensions as `u32` |
| `sim.frame`, `sim.seed` | Step counter and per-step hash seed |
| `sim.currentRow` | Current row for `advancesRow` rules |
| `rand01(seed) -> f32` | Hash-based random value |
| `cellBase(x, y) -> i32` | Flat cell index helper |

Reads and writes use ping-pong buffers, so update order is independent. Write every channel of the current cell every step. Unwritten channels contain stale data from the destination buffer.

Use `globals` to inject helper functions or structs before the step entry point.

## Declared parameters

```ts
params: [
  { name: "feed", type: "f32", default: 0.0545, min: 0.005, max: 0.12 },
  { name: "enabled", type: "u32", default: 1, min: 0, max: 1 },
]
```

Supported types are `"f32"`, `"u32"`, and `"i32"`. The engine packs them into a uniform. Calls to `automaton.set(...)` clamp declared ranges, round integer types, and update the GPU without rebuilding.

Match WGSL literal types. Compare a `u32` parameter with `1u`, not `1.0` or `0.5`.

Parameter names must be valid WGSL field identifiers and unique.

## Storage buffers

Use read-only `Float32Array` storage for weights, kernels, palettes, or lookup tables:

```ts
storages: [{ name: "weights", data: weights }]
```

Read it in WGSL as `weights[index]`. Update an existing same-sized storage with:

```ts
engine.updateStorage("weights", nextWeights);
```

Changing storage shape or size should be modeled as a structural rebuild in a subclass.

## Structural state

Anything baked into WGSL—channel count, loop bounds, generated function text, storage shape—is structural.

Subclass `Automaton`, keep the value in instance state, and call `this.requestRebuild()` from its setter:

```ts
class RadiusRule extends Automaton {
  readonly name = "radius-rule";
  private radius = 4;

  build(): AutomatonDescriptor {
    return {
      channels: 1,
      params: [],
      step: buildStepForRadius(this.radius),
    };
  }

  setRadius(radius: number): void {
    this.radius = Math.max(1, Math.floor(radius));
    this.requestRebuild();
  }
}
```

Do not rebuild from high-frequency input.

## Render hints

Descriptor render hints:

```ts
render: {
  colorMode: 1,
  invertPalette: false,
}
```

- Mode `0`: channel 0 through the app palette.
- Mode `1`: channels 0 through 2 through per-channel gradients.
- Mode `2`: channels 0 through 2 as raw RGB.
- `invertPalette`: reverse off/on colors when the idle field has a high value.

Pick a channel layout and render mode together. If mode `2` is used, write valid RGB channels every step.

Use `stepParity: 2` when the rule has an intentional period-two phase and rendered frames should always sample the same phase.

Use `advancesRow: true` for row-history rules such as elementary cellular automata.

## Seeding

With `createAutomaton`, provide a custom seed when generic binary soup is unsuitable:

```ts
seed: (width, height, options) => {
  const data = new Float32Array(width * height * 2);
  // Populate every channel with a state the rule can develop from.
  return data;
}
```

With a subclass, override `seed(width, height, options)`.

Design the seed and rule together. Check that:

- returned length equals `width × height × channels`;
- clear mode represents the rule's true idle state;
- center mode makes sense for growth rules;
- random/noise modes preserve required channel correlations;
- structured neighborhoods exist when the transition rule requires them.

## Correctness checklist

1. Compile TypeScript.
2. Route `EngineOptions.onError` to a visible error surface.
3. Check browser shader-compilation messages and line numbers.
4. Write all channels on every path through `step`.
5. Keep WGSL scalar types consistent.
6. Pause and call `engine.step()` for deterministic inspection.
7. Use `await engine.getCells()` sparingly to assert numeric invariants.
8. Test wrapping and clamped edges if the rule depends on boundaries.
9. Verify the seed evolves instead of freezing, dying, or saturating.
10. Profile at the intended grid size.
