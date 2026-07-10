# Automata

A WebGPU cellular-automata library and interactive playground. Configure and
simulate three families of cellular automata in real time:

- **Elementary (1D / Wolfram)** — rules 0–255, visualized as stacked generations.
- **2D life-like (Conway's Game of Life & generalizations)** — birth/survival rules.
- **Neural CA** — multi-channel cells updated by configurable convolutions + a small
  activation network (configurable substrate, random/reseedable weights — no training).

It is **WebGPU-only**: the whole simulation (the ping-pong cell grid + per-cell update
kernel) and rendering run on the GPU.

## Monorepo

Managed with **pnpm workspaces**.

- `packages/core` — [`@cazala/automata`](packages/core), the engine library (Rollup, ESM).
- `packages/playground` — `@cazala/automata-playground`, the React + Vite playground.
- `packages/worker` — Cloudflare Worker that reverse-proxies `caza.la/automata`
  to the deployed playground at `automata.caza.la`.

## Getting started

Requires Node ≥ 18, pnpm 9, and a **WebGPU-capable browser** (recent Chrome / Edge /
Safari).

```bash
pnpm install       # install workspace deps
pnpm dev           # run the playground at http://localhost:3000
pnpm build         # build core, then the playground
pnpm build:core    # build just the library
pnpm type-check    # build core + typecheck the playground
```

## Playground

- **Homepage** with a live demo behind it; enters the playground on desktop
  (blocked with a notice on mobile).
- **Top bar**: play / pause, single **step**, reset, clear, paint / erase / pan tools,
  a steps-per-second speed control, and session save / load.
- **Sidebar**: pick the automaton family and tune its parameters, the grid
  (size, toroidal wrap), appearance (colors, grid lines), and the initial state —
  all applied to the running simulation in real time.
- **Canvas**: cursor-anchored mouse-wheel zoom, drag-to-pan, and click/drag cell
  painting on the grid.
- **Sessions**: save/load named configurations to `localStorage`, plus JSON
  export/import.

## Library usage

```ts
import { Engine, Life } from "@cazala/automata";

const canvas = document.querySelector("canvas")!;
const engine = new Engine({
  canvas,
  automaton: new Life({ birth: 1 << 3, survival: (1 << 2) | (1 << 3) }), // Conway B3/S23
  grid: { width: 200, height: 200, wrap: true },
  stepsPerSecond: 20,
});

await engine.initialize();
engine.fitToGrid();
engine.randomize(0.3);
engine.play();
```

See [`packages/core/README.md`](packages/core/README.md) for the full API.

## Cloudflare Worker

The Worker package deploys `cazala-automata-worker` with a route for
`caza.la/automata*`. It strips the `/automata` prefix and proxies requests to
`https://automata.caza.la`, keeping the browser URL on `caza.la`.

```bash
pnpm --filter worker run typecheck
pnpm --filter worker run deploy
```

Worker configuration lives in [`packages/worker/wrangler.jsonc`](packages/worker/wrangler.jsonc).
The Worker tooling uses Wrangler and requires Node 22 in CI.

## License

MIT
