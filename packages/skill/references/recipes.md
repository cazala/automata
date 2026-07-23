# Creative recipes

These recipes distill built-in Automata configurations into reliable starting points. Copy the complete implementations from `assets/starter/src/scenes.ts`, then tune one layer at a time.

## Contents

- Recipe index
- Neural worms
- Gray-Scott mitosis
- Lenia organisms
- Pokémon domain battle
- Life-like maze
- Cyclic spirals
- Elementary tapestry
- Adapting a recipe

## Recipe index

| Recipe | Rule | Seed | Visual signature |
| --- | --- | --- | --- |
| Neural worms | Neural direct preset | Coherent random cells | Moving luminous filaments |
| Gray-Scott mitosis | Reaction-diffusion | Ragged catalyst patches | Dividing chemical spots |
| Lenia organisms | Lenia | Kernel-scale blobs | Soft continuous islands |
| Pokémon battle | Type-conversion CA | Voronoi domains | Color borders that consume one another |
| Life-like maze | B3/S12345 | Sparse soup | Branching binary corridors |
| Cyclic spirals | 14-state cyclic CA | Random states | Rotating rainbow fronts |
| Elementary tapestry | Wolfram rule 110 | Single top-center cell | Row-by-row fractal history |

## Neural worms

Use the verified preset and its returned seed options:

```ts
const automaton = new Neural();
const seed = automaton.applyPreset("worms");

const engine = new Engine({
  canvas,
  automaton,
  grid: gridForCanvas(width, height, { cellSize: 1.6, maxCells: 1024 }),
  stepsPerSecond: Neural.recommendedStepsPerSecond,
});

await engine.initialize();
engine.coverGrid();
engine.reset(seed);
engine.play();
```

Tune `gaussWidth` and the center/edge/corner kernel taps in small increments. Direct mode ignores network-only `updateRate`, `stepSize`, and `aliveMask`. Keep its preset `stepParity` behavior intact.

## Gray-Scott mitosis

```ts
const automaton = new ReactionDiffusion();
automaton.applyPreset("mitosis");

const engine = new Engine({
  canvas,
  automaton,
  grid: {
    ...gridForCanvas(width, height, { cellSize: 1, maxCells: 1536 }),
    maxCells: 1536,
  },
  stepsPerSecond: ReactionDiffusion.recommendedStepsPerSecond,
});

await engine.initialize();
engine.coverGrid();
engine.reset({ mode: "random", density: 0.2 });
engine.play();
```

Let the automaton create faint V noise and ragged patches. Symmetric noiseless spots can stop dividing. When adding an eraser, write `[1, 0]` to restore the chemical idle state.

Start from named feed/kill presets. Tiny changes can move the model between spots, worms, waves, and collapse.

## Lenia organisms

```ts
const automaton = new Lenia({
  radius: 8,
  mu: 0.2,
  sigma: 0.027,
  dt: 0.1,
});

const engine = new Engine({
  canvas,
  automaton,
  grid: gridForCanvas(width, height, { cellSize: 2.2, maxCells: 896 }),
  stepsPerSecond: Lenia.recommendedStepsPerSecond,
});

await engine.initialize();
engine.coverGrid();
engine.reset({ mode: "random", density: 1 });
engine.play();
```

Slide `sigma` toward `0.02` for sparse near-critical behavior. Larger values can saturate into plateaus; classic orbium-like values can die from generic random seeds. Radius is structural and expensive, so tune it rarely.

## Pokémon domain battle

```ts
const automaton = new Pokemon({
  threshold: 3,
  regionSize: 7,
});

const engine = new Engine({
  canvas,
  automaton,
  grid: gridForCanvas(width, height, { cellSize: 2, maxCells: 1024 }),
  stepsPerSecond: Pokemon.recommendedStepsPerSecond,
});

await engine.initialize();
engine.coverGrid();
engine.reset();
engine.play();
```

Threshold `3` creates slower domain wars; lower values accelerate conversion. `regionSize` affects the next seed only. Keep the Voronoi seed—uncorrelated type noise can freeze because cells do not see aligned attackers.

The four channels are `[r, g, b, typeIndex]`; use pan/zoom rather than painting incomplete channel values.

## Life-like maze

```ts
const preset = Life.PRESETS.maze;
const automaton = new Life({
  birth: countsToMask(preset.birth),
  survival: countsToMask(preset.survival),
});

const engine = new Engine({
  canvas,
  automaton,
  grid: gridForCanvas(width, height, { cellSize: 2, maxCells: 1024 }),
  stepsPerSecond: Life.recommendedStepsPerSecond,
});

await engine.initialize();
engine.coverGrid();
engine.reset({ mode: "random", density: preset.density });
engine.play();
```

The maze preset needs a sparse soup; Conway and Day & Night use denser starts. Use `countsToMask` for B/S notation rather than hand-encoding masks.

## Cyclic spirals

```ts
const automaton = new Cyclic({ states: 14, threshold: 1 });

const engine = new Engine({
  canvas,
  automaton,
  grid: gridForCanvas(width, height, { cellSize: 1.8, maxCells: 1024 }),
  stepsPerSecond: Cyclic.recommendedStepsPerSecond,
});

await engine.initialize();
engine.coverGrid();
engine.reset();
engine.play();
```

Lower state counts produce broader color bands. If decreasing `states` on a live scene, reset afterward because existing cells may contain indices outside the new cycle.

## Elementary tapestry

```ts
const automaton = new Elementary({ rule: 110 });
const engine = new Engine({
  canvas,
  automaton,
  grid: gridForCanvas(width, height, { cellSize: 2, maxCells: 1024 }),
  stepsPerSecond: Elementary.recommendedStepsPerSecond,
});

await engine.initialize();
engine.fitToGrid(0.95);
engine.reset();
engine.play();
```

Elementary rules use the 2D grid as a scrolling history and always seed one cell at the top center. Choose a rule from `Elementary.PRESETS`; pointer editing is usually less useful than reset, pause, and single-step controls.

## Adapting a recipe

Change in this order:

1. Choose viewport-relative grid scale and a GPU ceiling.
2. Use the rule's specialized seed.
3. Establish the recommended simulation rate.
4. Tune one or two realtime parameters.
5. Design the palette while preserving render hints.
6. Add rule-aware interaction.
7. Inspect startup and settled behavior.
8. Increase grid dimensions only after profiling.
