# Automata — [caza.la/automata](https://caza.la/automata/)

A framework-agnostic TypeScript library for building real-time cellular
automata with WebGPU. Explore neural CA, Gray-Scott reaction-diffusion, Lenia,
Pokemon type battles, life-like and Wolfram rules, or write your own rule in
WGSL.

## Key features

- **WebGPU compute:** advance large cell grids in parallel and render directly
  from GPU storage buffers.
- **Eight built-in automata:** neural CA, reaction-diffusion, Lenia, Pokemon,
  Life, elementary rules, Brian's Brain, and cyclic automata.
- **Tuned starting states:** each rule provides useful defaults, presets,
  render hints, and seeding designed for its dynamics.
- **Realtime controls:** update declared parameters with uniform writes and no
  pipeline rebuild.
- **Custom WGSL rules:** use `createAutomaton()` for a compact rule definition
  or subclass `Automaton` for storage buffers and structural state.
- **Camera and interaction helpers:** resize, zoom, pan, paint, erase, and grow
  a grid while preserving its contents.
- **Framework-agnostic core:** use the library from React, Vue, Svelte, or
  vanilla JavaScript, with no runtime dependencies.
- **Interactive playground:** tune six visual automata on desktop or mobile at
  [caza.la/automata](https://caza.la/automata/).

## Documentation

Read the searchable [documentation site](https://caza.la/automata/docs/) or
browse its Markdown sources in [`docs/`](./docs):

- **[Getting started](./docs/getting-started.md):** embed a simulation, choose a
  grid, seed a rule, tune parameters, and add pointer interaction.
- **[Built-in automata](./docs/automata.md):** parameters, presets, seeding
  behavior, tuning notes, and performance characteristics for every rule.
- **[Writing custom automata](./docs/custom-automata.md):** define WGSL rules,
  realtime parameters, storage buffers, render hints, and custom seeds.
- **[Architecture](./docs/architecture.md):** compute and render pipelines,
  ping-pong buffers, frame scheduling, camera behavior, and playground design.
- **[Contributing](./CONTRIBUTING.md):** development setup, repository layout,
  conventions, and verification workflow.

## Packages

This repository is a pnpm monorepo containing:

### [`@cazala/automata`](./packages/core) — core library

The zero-dependency TypeScript package. It contains the WebGPU engine, camera,
built-in rules, and framework for custom automata.

### [`playground`](./packages/playground) — interactive application

A React, Redux, and Vite application that showcases six automata with live
parameters, presets, sessions, pointer tools, responsive controls, and mobile
pinch zoom. It also serves as the integration reference and manual test bed.

### [`worker`](./packages/worker) — Cloudflare edge proxy

A route-scoped Cloudflare Worker that serves the Pages deployment at
`https://caza.la/automata` while proxying `https://automata.caza.la`. It keeps
the public URL on the main domain and forwards playground and documentation
assets under the `/automata` path.

## Quick start

Install the core library:

```bash
npm install @cazala/automata
```

Create an engine, seed its automaton, and start the simulation:

```ts
import { Engine, Neural, gridForCanvas } from "@cazala/automata";

const canvas = document.querySelector<HTMLCanvasElement>("#automata")!;
const engine = new Engine({
  canvas,
  automaton: new Neural(), // defaults to the "worms" rule
  grid: gridForCanvas(canvas.clientWidth, canvas.clientHeight),
  stepsPerSecond: 120,
});

await engine.initialize();
engine.coverGrid();   // center the camera and cover the canvas
engine.reset();       // use the automaton's tuned initial state
engine.autoResize();  // follow container resizes
engine.play();
```

This is enough for a complete animated site background. `initialize()` rejects
with a descriptive error when WebGPU is unavailable, so an application can
keep a CSS or static-image fallback.

## Built-in automata

| Class | System | Highlights |
| --- | --- | --- |
| `Neural` | Convolutional neural CA or an untrained random-MLP substrate | Worms, mitosis, mosaic, and network presets |
| `ReactionDiffusion` | Gray-Scott two-chemical model | Coral, mitosis, solitons, worms, and waves |
| `Lenia` | Continuous Life with a radial kernel and growth function | Realtime `mu`, `sigma`, and `dt`; structural radius |
| `Pokemon` | 18-type battle CA using the type-effectiveness chart | Coherent domains and adjustable battle threshold |
| `Life` | Any life-like birth/survival rule | Conway, Day & Night, maze, and coral presets |
| `Elementary` | Wolfram rules 0–255 rendered as scrolling history | Presets for visually interesting rules |
| `BriansBrain` | Three-state firing/refractory automaton | Glider-rich dynamics |
| `Cyclic` | Each state is consumed by its successor | Rotating spiral patterns |

Each class declares its parameter specifications and recommended simulation
rate; automata with presets expose them as static maps. The
[automata catalog](./docs/automata.md) covers the rule-specific details and
why their seeds matter.

## Core concepts

### Engine and grid

The engine stores `width × height × channels` floating-point values in two GPU
buffers. Each compute step reads the current buffer, writes the next buffer,
then swaps them. A fullscreen render pass colorizes the newest state without a
CPU readback.

### Realtime and structural changes

- **Realtime changes** such as `automaton.set("feed", 0.05)` update a uniform
  and take effect on the next step.
- **Structural changes** such as replacing an automaton, changing grid or
  channel dimensions, or updating Lenia's baked radius rebuild the affected
  buffers and pipelines.

### Custom rules

Wrap a WGSL update body with `createAutomaton()`:

```ts
import { createAutomaton } from "@cazala/automata";

const decay = createAutomaton({
  name: "decay",
  channels: 1,
  params: [
    { name: "rate", type: "f32", default: 0.98, min: 0.5, max: 1 },
  ],
  step: `setCell(x, y, 0, sampleAt(x, y, 0) * params.rate);`,
});
```

The [custom automata guide](./docs/custom-automata.md) documents shader helpers,
parameters, storage buffers, render hints, seeding, and debugging.

## Development

```bash
pnpm install
pnpm dev          # playground at http://localhost:3000
pnpm dev:docs     # docs at http://localhost:5173/automata/docs/
pnpm build        # core + playground + static docs
pnpm type-check   # core build + playground typecheck
```

The production workflow builds the playground with a `/automata/` base, then
builds the VitePress site into `packages/playground/dist/docs`. Cloudflare
Pages deploys the combined artifact and the worker exposes it on `caza.la`.

## Performance and browser support

- Simulation rate is independent from display refresh rate; the engine caps
  per-frame backlog to prevent a slow frame from causing a death spiral.
- `gridForCanvas()` chooses a grid from the canvas size and caps each dimension
  to keep fullscreen simulations bounded.
- Lenia is the most expensive built-in because its work scales with kernel
  radius squared; reaction-diffusion and small-neighborhood rules can run many
  more steps per second.
- A WebGPU-capable browser is required. Recent Chrome, Edge, and Safari releases
  are supported; applications should provide a fallback when `initialize()`
  cannot acquire a GPU device.

## License

MIT
