---
name: automata
description: Build and tune real-time cellular automata, generative textures, artificial-life scenes, and custom WGSL rules with @cazala/automata. Use when embedding Automata in web apps; selecting or configuring Neural, ReactionDiffusion, Lenia, Pokemon, Life, Elementary, BriansBrain, or Cyclic; designing seeds, palettes, camera controls, and interaction; translating playground settings into code; debugging WebGPU output; optimizing grid performance; or authoring custom Automaton rules.
---

# Automata

Build a visible evolving pattern first, then tune it. Treat an Automata scene as four layers:

1. A rule chosen for the desired visual behavior.
2. The rule's own seed strategy.
3. Grid scale, simulation rate, palette, and camera.
4. Realtime parameters and restrained interaction.

## Start with a working scene

Use `gridForCanvas`, initialize before mutating state, and prefer `reset()` over generic randomization:

```ts
import {
  Engine,
  ReactionDiffusion,
  gridForCanvas,
} from "@cazala/automata";

const canvas = document.querySelector<HTMLCanvasElement>("#automata")!;
const automaton = new ReactionDiffusion();
automaton.applyPreset("mitosis");

const engine = new Engine({
  canvas,
  automaton,
  grid: {
    ...gridForCanvas(canvas.clientWidth, canvas.clientHeight, {
      cellSize: 1,
      maxCells: 1536,
    }),
    wrap: true,
    maxCells: 1536,
  },
  stepsPerSecond: ReactionDiffusion.recommendedStepsPerSecond,
  render: {
    colorOn: { r: 0.96, g: 0.78, b: 0.45, a: 1 },
    colorOff: { r: 0.035, g: 0.04, b: 0.07, a: 1 },
    colorBg: { r: 0.015, g: 0.018, b: 0.03, a: 1 },
  },
  onError: console.error,
});

await engine.initialize();
engine.coverGrid();
engine.reset({ mode: "random", density: 0.2 });
const stopAutoResize = engine.autoResize();
engine.play();

window.addEventListener("beforeunload", () => {
  stopAutoResize();
  engine.destroy();
}, { once: true });
```

Copy [the full Vite starter](assets/starter/) when building a new app. It includes six selectable scenes, responsive sizing, zoom, rule-aware pointer interaction, WebGPU error handling, and cleanup. Read its [tested scene source](assets/starter/src/scenes.ts) when adapting a recipe.

## Choose a rule by visual intent

| Intent | Start with |
| --- | --- |
| Worms, mosaics, alien textures | `Neural`; use a named preset and its returned seed options |
| Coral, spots, waves, organic textures | `ReactionDiffusion`; choose a verified preset |
| Soft continuous organisms | `Lenia`; keep its tuned seed and low step rate |
| Competing colored domains | `Pokemon`; preserve its Voronoi seed |
| Conway or life-like binary patterns | `Life`; convert a preset's counts with `countsToMask` |
| Fractal row-by-row history | `Elementary` with a rule from `Elementary.PRESETS` |
| Electric glider storms | `BriansBrain` |
| Rotating rainbow spirals | `Cyclic` |
| A new local rule | `createAutomaton`; subclass `Automaton` for structural state or storages |

Use the smallest rule and grid that express the idea. Do not imitate an effect by bypassing the automaton's seeding or render hints.

## Work creatively

1. Describe the desired morphology, motion, palette, scale, and interaction in one sentence.
2. Select the closest built-in rule before writing custom WGSL.
3. Use the rule's `seed()` through `engine.reset(...)`.
4. Establish grid scale and `recommendedStepsPerSecond`.
5. Tune one or two realtime parameters while watching several hundred generations.
6. Add palette, zoom, and interaction after the dynamics are legible.
7. Inspect startup, early evolution, and settled behavior. Fix dead, saturated, flickering, or featureless states before increasing grid size.

Read [creative-workflow.md](references/creative-workflow.md) before inventing or substantially tuning a scene. Read [recipes.md](references/recipes.md) for compositions based on built-in rules.

## Preserve rule semantics

- Call `engine.reset(seedOptions)` to use the active automaton's specialized seed.
- Treat Gray-Scott's idle state as `[1, 0]`; filling it with `[0, 0]` creates inert cells.
- Use preset-specific seed options: `Neural.applyPreset(name)` returns them, while `ReactionDiffusion.applyPreset(name)` only changes parameters.
- Update declared values with `automaton.set(...)` or typed setters; they are clamped realtime uniform writes.
- Treat channel count, neural mode/hidden size, and Lenia radius as structural changes. Do not animate them per frame.
- Preserve automaton render hints unless intentionally overriding `colorMode`.

## Preserve WebGPU performance

- Provide a CSS or static fallback. Automata has no CPU runtime.
- Size the grid with `gridForCanvas`; cost scales with `width × height × channels`.
- Increase `cellSize` to reduce grid dimensions before weakening the rule.
- Treat `getCells()` as a full GPU-to-CPU readback. Never call it in animation, pointer-move, or render loops.
- Keep Lenia's radius modest; its neighborhood work scales approximately with the square of the diameter.
- Use `ensureGridCovers()` after programmatic zoom or pan, and set a deliberate `maxCells` ceiling.
- Use the rule's recommended simulation rate as a starting point; simulation steps are decoupled from display FPS.

## Load the right detail

- Read [api.md](references/api.md) for lifecycle, grid, state, view, built-ins, parameters, and interaction.
- Read [creative-workflow.md](references/creative-workflow.md) before designing or substantially tuning a visual.
- Read [recipes.md](references/recipes.md) when adapting a known pattern.
- Read [custom-rules.md](references/custom-rules.md) before authoring WGSL or subclassing `Automaton`.
- Read [troubleshooting.md](references/troubleshooting.md) when output is blank, frozen, unstable, slow, or visually weak.
- Read the repository `docs/architecture.md` only when changing Automata internals from a full checkout.

## Validate the result

- Compile the implementation; do not guess class names, preset names, parameter keys, or channel layouts.
- Run it in a WebGPU-capable browser and surface `EngineOptions.onError`.
- Confirm the canvas has non-zero CSS dimensions and the grid covers the view.
- Watch enough generations for the rule's characteristic behavior to emerge.
- Test resize, zoom, pointer behavior, and the no-WebGPU fallback.
- Dispose `autoResize()` observers and call `engine.destroy()` during teardown.
- Visually inspect the output. A creative task must produce coherent evolution, not merely valid code.
