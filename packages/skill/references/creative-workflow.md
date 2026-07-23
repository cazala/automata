# Creative workflow

Use this process when a request describes a mood or visual effect instead of a specific cellular-automata rule.

## 1. Write a visual sentence

Translate the request into:

- morphology: worms, spots, waves, domains, corridors, spirals, organisms;
- evolution: divide, compete, propagate, self-organize, pulse, settle;
- surface: binary, continuous, chemical, neural, multicolor;
- scale: fine texture, visible cells, large domains;
- palette: background, off state, on state, contrast;
- interaction: erase, paint, pan, zoom, parameter control.

Example: “Warm chemical spots divide slowly across a dark field, with drag-to-clear openings and smooth wheel zoom.”

## 2. Choose the closest rule

- `Neural`: alien textures, worms, mitosis-like blobs, colorful mosaics.
- `ReactionDiffusion`: organic spots, coral, labyrinths, solitons, waves.
- `Lenia`: soft continuous growth with creature-like islands.
- `Pokemon`: stable colored domains with active competitive borders.
- `Life`: crisp binary birth/survival structures.
- `Elementary`: one-dimensional fractal histories.
- `BriansBrain`: moving heads with refractory trails.
- `Cyclic`: colorful wavefronts and spirals.

Start with `createAutomaton` only when no built-in rule expresses the requested local update.

## 3. Preserve the initial conditions

The seed is part of the artwork, not boilerplate:

- Use the `SeedOptions` returned by `Neural.applyPreset(...)`.
- Let `ReactionDiffusion.seed()` create its fed U field and ragged V patches.
- Use Lenia's continuous blob seed.
- Keep Pokémon's coherent Voronoi regions.
- Use each `Life.PRESETS` density.
- Let Elementary plant the top-center cell.

Call `engine.reset(seedOptions)` after initialization. Avoid replacing a specialized seed with `randomize()`.

## 4. Set spatial and temporal scale

Choose `cellSize` based on the visual:

- `1–1.5`: fine chemical or neural texture on a strong GPU budget.
- `1.5–2.5`: balanced fullscreen generative work.
- `3+`: deliberately visible cells or a constrained mobile budget.

Start at the rule's `recommendedStepsPerSecond`. A high value does not mean a higher frame rate: simulation generations and rendering are decoupled.

Set `maxCells` deliberately. Use a lower cap for Lenia or multi-channel Neural scenes, and a higher cap only after profiling.

## 5. Tune dynamics before color

Watch the rule for long enough to reveal its attractor:

- Neural direct presets can establish structure quickly but alternate phase internally.
- Gray-Scott may need hundreds or thousands of tiny integration steps.
- Lenia can grow, saturate, or die depending on a narrow `mu`/`sigma` region.
- Pokémon changes only at domain borders.
- Sparse Life presets need time to branch.

Change one parameter at a time. Prefer typed setters or `automaton.set(name, value)`. Keep structural values fixed during live tuning.

## 6. Design the palette around render hints

- Single-channel rules map `colorOff` to `colorOn`.
- Reaction-diffusion inverts that gradient because chemical U idles high.
- Neural multi-channel output uses per-channel gradients.
- Pokémon and Cyclic carry raw RGB; palette colors do not recolor them.
- `colorBg` matters outside the grid and during static fallback.

Use contrast to reveal low-amplitude growth without crushing the entire field into black or white.

## 7. Add rule-aware interaction

Good interactions:

- erase with `fillCircle(...)` for Neural, Lenia, or Life;
- restore `[1, 0]` with `fillCircle(...)` for ReactionDiffusion;
- pan and zoom for Pokémon or Cyclic, where arbitrary cell edits need valid encoded channels;
- single-step controls for Life, Elementary, and custom-rule debugging;
- parameter sliders generated from `paramSpecs`.

Convert pointer coordinates to cell/world coordinates. Interpolate stamps along fast pointer movement so strokes do not become dotted.

## 8. Inspect three stages

1. Startup: the canvas is visible, seeded, covered, and error-free.
2. Early evolution: the intended morphology emerges at the expected scale.
3. Settled evolution: the scene remains alive without saturating, dying, freezing, or becoming visually uniform.

Inspect resize and zoom behavior too. If a scene changes character after resize, check whether grid growth, camera movement, or unintended re-seeding occurred.

## 9. Scale only after the scene works

Increase grid size after the rule, seed, rate, and palette are coherent. Use FPS as a warning signal, not the only goal: a scene can render at 60 FPS while accumulating fewer simulation generations than intended.

Never poll `getCells()` for a live visualization. The renderer already reads GPU storage directly.
