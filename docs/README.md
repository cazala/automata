# Automata 🦠

Automata is a framework-agnostic TypeScript library for building real-time
cellular automata with WebGPU. It includes neural CA, Gray-Scott
reaction-diffusion, Lenia, Pokemon type battles, life-like and elementary
rules, plus a compact API for writing your own rules in WGSL.

[Open the playground](https://caza.la/automata/) ·
[View on GitHub](https://github.com/cazala/automata)

## What can you build with Automata?

Use Automata for animated site backgrounds, generative art, artificial-life
experiments, reaction-diffusion textures, classic cellular automata, and custom
GPU simulations. The included playground lets you explore six visual systems,
tune parameters live, and test desktop and touch interactions before writing
any integration code.

## Key features

- **WebGPU compute** — advance large cell grids in parallel and render them
  directly from GPU storage buffers.
- **Eight built-in automata** — neural CA, Gray-Scott, Lenia, Pokemon, Life,
  elementary rules, Brian's Brain, and cyclic automata.
- **Rules that start well** — each automaton provides tuned defaults, presets,
  render hints, and seeding suited to its dynamics.
- **Realtime parameters** — update declared values with uniform writes, without
  rebuilding the compute pipeline.
- **Custom WGSL rules** — define an automaton with a shader body and metadata,
  or subclass `Automaton` for structural state and storage buffers.
- **Camera and interaction helpers** — resize, zoom, pan, paint, erase, and grow
  a grid while preserving its contents.
- **Framework-agnostic and zero-dependency** — the core package works with any
  UI stack and ships no runtime dependencies.
- **Interactive playground** — inspect presets and parameters at
  [caza.la/automata](https://caza.la/automata/).

## Quick start

Install the library:

```bash
npm install @cazala/automata
```

Create an engine, seed the automaton, and start the simulation:

```ts
import { Engine, Neural, gridForCanvas } from "@cazala/automata";

const canvas = document.querySelector<HTMLCanvasElement>("#automata")!;
const engine = new Engine({
  canvas,
  automaton: new Neural(),
  grid: gridForCanvas(canvas.clientWidth, canvas.clientHeight),
  stepsPerSecond: 120,
});

await engine.initialize();
engine.coverGrid();
engine.reset();
engine.autoResize();
engine.play();
```

`initialize()` requests a WebGPU device and rejects with a descriptive error
when WebGPU is unavailable. The rest of the engine stays plain TypeScript, so
you can use it from React, Vue, Svelte, or vanilla JavaScript.

## Where to go next

- **[Getting started](./getting-started.md)** — embed a simulation, choose a
  grid, seed a rule, tune parameters, and add pointer interaction.
- **[Built-in automata](./automata.md)** — compare every rule, its presets,
  parameters, seeding behavior, and performance profile.
- **[Writing custom automata](./custom-automata.md)** — create WGSL rules,
  uniforms, storage buffers, render hints, and custom seeds.
- **[Architecture](./architecture.md)** — understand the compute and render
  pipelines, ping-pong buffers, frame loop, camera, and playground bridge.

Automata is released under the MIT License.
