# Contributing

## Setup

```bash
pnpm install
pnpm dev        # vite dev server for the playground (http://localhost:3000)
```

You need a WebGPU-capable browser (recent Chrome/Edge/Safari). The playground
hot-reloads on changes to both packages: the playground consumes
`packages/core/dist`, and `pnpm dev` does **not** rebuild core — run
`pnpm build:core` after touching `packages/core/src` (or keep
`pnpm build:core --watch`-equivalent in a second terminal via `npx rollup -c -w`
inside `packages/core`).

## Scripts

| Command | Effect |
| --- | --- |
| `pnpm dev` | Playground dev server (`--host`, reachable from your phone on the LAN) |
| `pnpm dev:docs` | VitePress docs dev server at `/automata/docs/` |
| `pnpm build` | Build core, playground, then static documentation |
| `pnpm build:core` | Rollup build of the library into `packages/core/dist` |
| `pnpm build:docs` | Build docs into `packages/playground/dist/docs` |
| `pnpm type-check` | Build core + `tsc --noEmit` on the playground |

There is no test suite; verification is done by driving the playground in a
real browser (see "Verifying changes" below).

## Repo layout

```
packages/core/            the library (@cazala/automata)
  src/engine.ts           GPU device, buffers, pipelines, loop, camera
  src/automaton.ts        Automaton base class, descriptor types, createAutomaton
  src/automata/*.ts       built-in rules (one file each)
  src/webgpu/             WGSL templating (compute + render shaders)
packages/playground/      demo app (React + Redux + Vite)
  src/engine/EngineProvider.tsx   engine <-> redux glue
  src/store/configSlice.ts        all user-facing settings + sanitization
  src/components/Sidebar.tsx      the settings panel / mobile bottom sheet
packages/worker/          route-scoped Cloudflare Worker for caza.la/automata
docs/                     Markdown guides + VitePress configuration
```

## Adding a built-in automaton

1. **Core**: create `packages/core/src/automata/<name>.ts` — subclass
   `Automaton`, declare a static `PARAMS: ParamSpec[]` (single source of truth
   for defaults/ranges), implement `build()` (WGSL) and `seed()` (an initial
   state the rule develops well from — this matters, see
   [docs/automata.md](docs/automata.md) for cautionary tales). Export it from
   `src/automata/index.ts`.
2. **Playground**: add the type to `AutomatonType` and a config slice entry in
   `configSlice.ts`, a `buildAutomaton` case + param-sync effect in
   `EngineProvider.tsx`, and a settings section in `Sidebar.tsx`.
3. Read [docs/custom-automata.md](docs/custom-automata.md) for the WGSL
   contract and common pitfalls (u32/f32 comparisons, period-2 flicker, ...).

## Verifying changes

Shader compile errors are surfaced via the engine's `onError` (default
`console.error`) — check the browser console first when a simulation appears
frozen. Beyond that, the effective verification loop used for everything in
this repo is empirical: run the playground, switch to the affected automaton,
and confirm the behavior (readbacks via `engine.getCells()` from the console
are handy for measuring rather than eyeballing).

## Style

- No runtime dependencies in core; keep it framework-agnostic (no React).
- WGSL lives in template literals tagged with `/* wgsl */` comments.
- Comments explain *constraints* (why the code must be this way), not narration.
