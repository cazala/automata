# Automata

A library for building cellular automata simulations with WebGPU — neural CA,
reaction-diffusion, Lenia, and the classics, all running on the GPU in real time.

**Live demo:** the playground in this repo boots straight into "neural worms" and
lets you switch between six automata, tune every parameter live, erase cells with
the pointer, and run on mobile (bottom-sheet UI, pinch zoom).

## Packages

| Package | What it is |
| --- | --- |
| [`@cazala/automata`](packages/core) | The library: WebGPU engine + automata. Framework-agnostic, zero dependencies. |
| [`playground`](packages/playground) | Demo app (React + Redux + Vite) exercising everything the library can do. |

## Quick taste

```ts
import { Engine, Neural, gridForCanvas } from "@cazala/automata";

const canvas = document.querySelector("canvas");
const engine = new Engine({
  canvas,
  automaton: new Neural(), // defaults to the "worms" rule
  grid: gridForCanvas(canvas.clientWidth, canvas.clientHeight),
});
await engine.initialize();
engine.coverGrid();   // camera: grid exactly fills the canvas
engine.reset();       // the automaton's own initial state
engine.autoResize();  // follow container resizes
engine.play();
```

That is a complete animated site background. See
[docs/getting-started.md](docs/getting-started.md) for the full walkthrough.

## Documentation

- [Getting started](docs/getting-started.md) — embed a simulation in any page
- [The automata](docs/automata.md) — catalog of built-in rules, parameters, presets, and tuning notes
- [Custom automata](docs/custom-automata.md) — write your own rule in WGSL (no fork needed)
- [Architecture](docs/architecture.md) — how the engine works inside
- [Contributing](CONTRIBUTING.md) — dev setup and conventions

## Development

```bash
pnpm install
pnpm dev          # playground at http://localhost:3000 (needs a WebGPU browser)
pnpm build        # build core + playground
pnpm type-check   # build core, typecheck playground
```

WebGPU requires a recent Chrome, Edge, or Safari.

## License

MIT
