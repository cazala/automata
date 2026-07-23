# @cazala/automata

A library for building cellular automata simulations with WebGPU. Six built-in
automata — neural CA (worms), Gray-Scott reaction-diffusion, Lenia, a pokemon
type-battle CA, life-like rules, and elementary (Wolfram) rules — plus a small
framework for writing your own rule in a few lines of WGSL. Framework-agnostic,
zero dependencies, WebGPU-only.

```bash
npm install @cazala/automata
```

## Animated background in ~10 lines

```ts
import { Engine, Neural, gridForCanvas } from "@cazala/automata";

const canvas = document.querySelector("canvas"); // position: fixed; inset: 0
const engine = new Engine({
  canvas,
  automaton: new Neural(), // defaults to the "worms" rule
  grid: gridForCanvas(canvas.clientWidth, canvas.clientHeight),
});
await engine.initialize();
engine.coverGrid();   // camera: grid exactly covers the canvas
engine.reset();       // the automaton's own initial state
engine.autoResize();  // track container size changes
engine.play();
```

Every automaton ships with sensible defaults, verified presets, and a `seed()`
that produces an initial state the rule actually develops well from — you never
need to know that Gray-Scott freezes without noisy ragged seeding, or that the
pokemon rule deadlocks without coherent starting domains. It's all baked in.

Full walkthrough: [docs/getting-started.md](https://github.com/cazala/automata/blob/main/docs/getting-started.md)

## Concepts

The world is a 2D **cell grid** of `width × height × channels` f32 values in two
ping-pong GPU storage buffers. Each step, a compute shader reads a cell's
neighborhood from the source buffer and writes the next state to the
destination. A fullscreen render pass colorizes the latest buffer every frame.

An **Automaton** describes the update rule as WGSL plus metadata (declared
params with ranges, render hints, seeding). Two kinds of change:

- **Realtime** — updating a declared param (`automaton.set("feed", 0.05)`) is a
  uniform write; takes effect next step, no rebuild.
- **Structural** — changing the automaton, grid size, channel count, or baked
  constants (e.g. Lenia's radius) rebuilds pipelines/buffers.

## Built-in automata

| Class | The idea | Highlight params |
| --- | --- | --- |
| `Neural` | conv3x3 → activation per channel ("worms"), or a random-MLP substrate | kernel, gaussWidth, activation |
| `ReactionDiffusion` | Gray-Scott two-chemical model | feed, kill (see `PRESETS`) |
| `Lenia` | continuous Life: ring kernel + gaussian growth | radius, mu, sigma |
| `Pokemon` | 18-type battle CA over the real type chart | threshold, regionSize |
| `Life` | any life-like rule via birth/survival masks | see `Life.PRESETS` |
| `Elementary` | Wolfram rules 0-255, drawn row by row | rule |
| `BriansBrain` | 3-state glider storm | birth |
| `Cyclic` | rock-paper-scissors spirals | states, threshold |

Each class exposes `PARAMS` (names/defaults/ranges), typed accessors,
`PRESETS` where applicable, and `recommendedStepsPerSecond`. Full catalog with
tuning notes: [docs/automata.md](https://github.com/cazala/automata/blob/main/docs/automata.md)

## Engine API (summary)

- **Lifecycle**: `initialize()`, `play()`, `pause()`, `toggle()`, `step()`,
  `destroy()`, `isPlaying()`, `getFPS()`, `setStepsPerSecond(n)`
- **State**: `reset(seedOptions?)` (automaton-provided initial state),
  `clear()`, `randomize(density, mode?)`, `setCell(x, y, values)`,
  `seedPoint(x, y)`, `fillCircle(cx, cy, r, values)` (eraser/brush),
  `setCells(data)`, `getCells()` (async readback)
- **Camera**: `coverGrid()` / `fitToGrid()`, `setZoom()`, `setCamera()`,
  `ensureGridCovers()` (grow-to-cover on zoom-out, preserving contents),
  `setCoverMinZoom(true)` (pin min zoom to the cover level — good for touch)
- **Sizing**: `autoResize(el?)` (one-liner ResizeObserver wiring),
  `setSize(w, h)`, `resize(gridW, gridH)`, plus the `gridForCanvas()` helper
- **Errors**: pass `onError` in `EngineOptions` — shader compile and pipeline
  validation errors are reported there (default `console.error`) instead of
  failing silently.

## Custom automata

Subclass `Automaton`, or wrap plain WGSL:

```ts
import { createAutomaton } from "@cazala/automata";

const rule = createAutomaton({
  channels: 1,
  params: [{ name: "decay", type: "f32", default: 0.98, min: 0.5, max: 1 }],
  step: `setCell(x, y, 0, sampleAt(x, y, 0) * params.decay);`,
});
```

The WGSL contract (`sampleAt`, `setCell`, `rand01`, `params.*`, `sim.*`),
storages, render hints, seeding, and a worked example:
[docs/custom-automata.md](https://github.com/cazala/automata/blob/main/docs/custom-automata.md)

## Requirements

A WebGPU-capable browser (recent Chrome, Edge, or Safari). The engine throws a
descriptive error from `initialize()` when WebGPU is unavailable.

## License

[MIT](./LICENSE)
