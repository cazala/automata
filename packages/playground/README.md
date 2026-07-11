# Automata playground

The demo app for [`@cazala/automata`](../core) — a React + Redux + Vite
front-end that exercises everything the library can do. Live simulations of
all six surfaced automata with every parameter tunable in real time.

Not published to npm; it exists as the library's showcase, manual test bed,
and a reference implementation for interaction patterns (see below).

## Run it

```bash
pnpm install       # repo root
pnpm dev           # http://localhost:3000, --host (reachable from your phone)
```

Requires a WebGPU browser (recent Chrome/Edge/Safari). The dev server serves
`packages/core` from its built `dist` — run `pnpm build:core` after editing
library source.

## What's in it

- **Six automata**: Neural (worms — the boot default), Pokemon type battles,
  Gray-Scott reaction-diffusion, Lenia, life-like rules, and elementary
  (Wolfram) rules, with per-automaton presets, speeds, and settings panels.
- **Live tuning**: every declared parameter is a slider/toggle wired to the
  automaton's realtime setters; structural knobs (Lenia radius, states)
  rebuild transparently.
- **Interaction**: per-automaton pointer modes — a 25-cell eraser with stroke
  interpolation (neural/RD/lenia/life), camera panning (pokemon), inert
  (elementary) — plus wheel zoom and two-finger pinch zoom, with grow-to-cover
  grid semantics on zoom-out.
- **Mobile support**: the settings panel becomes a drag-up bottom sheet, the
  boot view is pinned as max zoom-out, and touch painting is pinch-safe.
- **Pokemon extras**: live type-share legend (GPU readback poll), a running
  battle counter, and click-to-toggle type participation.
- **Sessions**: save/load named configurations via localStorage, with
  sanitization for configs from older versions.

## Where things live

| Path | Role |
| --- | --- |
| `src/engine/EngineProvider.tsx` | the entire React ↔ engine bridge: builds automata from config, dual-writes param changes, seeding via `engine.reset()` |
| `src/store/configSlice.ts` | all user-facing settings, defaults, clamping/sanitization (also the session persistence format) |
| `src/components/Canvas.tsx` | pointer/pinch interaction reference implementation |
| `src/components/Sidebar.tsx` | settings panel; desktop overlay + mobile bottom sheet |
| `src/utils/sessions.ts` | localStorage session store |

The engine itself stays framework-agnostic — if you're embedding the library
in your own app, `EngineProvider.tsx` and `Canvas.tsx` are the files worth
reading, and [docs/getting-started.md](../../docs/getting-started.md) is the
distilled version.
