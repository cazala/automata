# Troubleshooting

## WebGPU initialization fails

- Automata is WebGPU-only; there is no CPU fallback.
- Catch `engine.initialize()` and preserve a CSS, image, or video fallback.
- Confirm the browser, operating system, and graphics adapter expose `navigator.gpu`.
- Surface the actual rejection message instead of replacing it with a generic blank state.

## Blank canvas

- Give the canvas non-zero CSS width and height.
- Call `await engine.initialize()` before `coverGrid()`, `reset()`, or `play()`.
- Call `engine.reset()` after initialization.
- Use `coverGrid()` or `fitToGrid()` so the camera sees the grid.
- Check `colorOff`, `colorOn`, and `colorBg` contrast.
- Leave `render.colorMode` undefined unless intentionally overriding automaton hints.
- Route `onError` to the console and visible UI; WGSL errors can otherwise look like a frozen scene.

## Frozen or dead pattern

- Use the automaton's specialized `reset()` rather than `randomize()`.
- For Neural, use the seed options returned by `applyPreset(...)`.
- For ReactionDiffusion, do not upload an all-zero grid; idle cells are `[1, 0]`.
- For Pokémon, preserve coherent Voronoi domains.
- For Lenia, use its blob seed and tuned `mu`/`sigma`.
- For sparse Life rules, use the preset density.
- Confirm `engine.isPlaying()` and a positive steps-per-second value.

## Pattern saturates or becomes featureless

- Restore the built-in preset and seed before tuning.
- Change one realtime parameter at a time.
- Reduce Lenia `sigma` if it fills into solid plateaus.
- Move Gray-Scott feed/kill back to a named operating point.
- Reset Cyclic after reducing the number of states.
- Increase palette contrast only after checking that the underlying cells still vary.

## Flicker

- Do not bypass Neural direct mode's descriptor; it uses `stepParity: 2`.
- Avoid manual stepping that renders alternating phases as an animation.
- Check CSS or React code for accidental canvas size assignments every frame.
- Use `engine.setSize(...)`, which skips no-op backing-store resets.

## Slow simulation

- Increase `gridForCanvas` `cellSize` to reduce cell count.
- Lower `maxCells`, especially for Lenia and multi-channel Neural.
- Reduce Lenia radius; work scales approximately with `(2R + 1)²`.
- Distinguish render FPS from generations per second.
- Do not call `getCells()` in recurring code.
- Avoid repeated grid growth from unconstrained zoom-out; set a deliberate maximum or `setCoverMinZoom(true)`.

## Pointer interaction is offset

- Subtract the canvas bounding rectangle from `clientX/clientY`.
- Convert canvas-local pixels with engine size, camera, and zoom.
- Keep coordinates in cell/world units when calling `fillCircle`.
- Recompute coordinates after zoom and resize.

## Erasing reaction-diffusion leaves dead holes

Use `[1, 0]`, not `[0, 0]`:

```ts
engine.fillCircle(worldX, worldY, radius, [1, 0]);
```

Gray-Scott needs chemical U present in its idle field.

## Zoom or resize loses content

- `resize(width, height)` reallocates the grid and is not a visual resize helper.
- Use `setSize(...)` or `autoResize(...)` for the canvas.
- Call `ensureGridCovers()` after programmatic pan or zoom to grow while preserving content.
- Use `coverGrid()` only when intentionally recentering.

## TypeScript rejects an option

- Check the installed package version rather than guessing from a playground label.
- Distinguish preset keys from display labels.
- Convert Life neighbor-count arrays with `countsToMask`.
- Use `Activation` numeric values or exported preset configuration for Neural.
- Remember that `gridForCanvas(...)` returns width/height; add `wrap` and engine `maxCells` in the `grid` object if needed.

## Custom WGSL freezes

- Read browser compilation errors from `onError`.
- Match `u32`, `i32`, and `f32` types and literal suffixes.
- Write every channel on every path.
- Ensure declared storage names and parameter names are valid WGSL identifiers.
- Pause and single-step, then inspect `getCells()` occasionally for numeric invariants.
- Test the seed separately; a valid shader can still receive an inert state.

## Output works but is visually weak

- State the intended morphology, evolution, palette, scale, and interaction.
- Select a closer built-in rule before adding custom complexity.
- Restore the specialized seed.
- Watch long enough for the rule's characteristic behavior to develop.
- Tune dynamics before palette and interaction.
- Inspect both startup and settled evolution; creative success requires a coherent temporal composition.
