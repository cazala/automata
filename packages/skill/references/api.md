# Automata API reference

Use this reference for application code. Read `custom-rules.md` before writing WGSL, and consult repository architecture docs only when changing Automata internals.

## Contents

- Engine lifecycle
- Built-in automata
- Seeding and presets
- Parameters and structural changes
- Grid and state
- View and coordinates
- Rendering
- Inspection and teardown

## Engine lifecycle

```ts
const engine = new Engine({
  canvas,
  automaton,
  grid: {
    width: 512,
    height: 512,
    wrap: true,
    maxCells: 1024,
  },
  stepsPerSecond: 120,
  render: {
    colorOff: { r: 0.05, g: 0.05, b: 0.07, a: 1 },
    colorOn: { r: 0.78, g: 0.85, b: 1, a: 1 },
    colorBg: { r: 0.02, g: 0.02, b: 0.03, a: 1 },
    showGrid: false,
    gridThreshold: 8,
  },
  onError: (error) => console.error(error),
});

await engine.initialize();
engine.coverGrid();
engine.reset();
const stopAutoResize = engine.autoResize();
engine.play();
```

`initialize()` requests a WebGPU adapter, device, canvas context, compute pipeline, and render pipeline. It rejects when WebGPU is unavailable. There is no CPU fallback.

Use `isInitialized()`, `play()`, `pause()`, `toggle()`, `isPlaying()`, `stop()`, `step()`, and `destroy()` for lifecycle control. The render loop stays active while paused so camera changes remain visible.

## Built-in automata

| Class | Channels | Character | Default or recommended seed | Steps/s |
| --- | ---: | --- | --- | ---: |
| `Neural` | 6 by default | Worms, mosaics, random neural textures | Preset-specific, often random density `0.2` | 120 |
| `ReactionDiffusion` | 2 | Gray-Scott coral, spots, worms, waves | Specialized ragged V patches in an idle U field | 1000 |
| `Lenia` | 1 | Continuous blobs and organisms | Kernel-scale continuous blobs | 30 |
| `Pokemon` | 4 | Colored type-domain battles | Specialized Voronoi mosaic | 100 |
| `Life` | 1 | Conway and other B/S rules | Preset-specific soup density | 120 |
| `Elementary` | 1 | Wolfram row history | Single top-center cell | 120 |
| `BriansBrain` | 1 | Firing/refractory glider storm | Sparse random firing cells | 120 |
| `Cyclic` | 4 | Rotating multicolor spirals | Uniform random states | 120 |

Use each class's static `recommendedStepsPerSecond` rather than hard-coding the table.

Useful exports include:

- `Neural.PRESETS`, `WORMS_KERNEL`, and `WORMS_GAUSS_WIDTH`
- `ReactionDiffusion.PRESETS`
- `Life.PRESETS`, `countsToMask(...)`, and `maskToCounts(...)`
- `Elementary.PRESETS`
- `POKEMON_TYPES` and `POKEMON_TYPE_COUNT`
- `cyclicColor(...)`

## Seeding and presets

Prefer:

```ts
engine.reset({ mode: "random", density: 0.2 });
```

This calls the active automaton's `seed(width, height, options)` implementation. Supported seed modes are `"random"`, `"noise"`, `"center"`, and `"clear"`, but an automaton may interpret or ignore a mode according to its dynamics.

Important differences:

- `Neural.applyPreset(name)` changes mode/values and returns the matching `SeedOptions`.
- `ReactionDiffusion.applyPreset(name)` changes feed/kill only; call `reset(...)` separately.
- `Life.PRESETS` supplies neighbor counts and a suited density. Convert counts to masks:

```ts
const preset = Life.PRESETS.daynight;
const automaton = new Life({
  birth: countsToMask(preset.birth),
  survival: countsToMask(preset.survival),
});
engine.reset({ mode: "random", density: preset.density });
```

- `Pokemon.seed()` creates coherent domains; per-cell noise can deadlock the rule.
- `ReactionDiffusion.seed()` creates an idle `[u, v] = [1, 0]` field with noisy catalyst patches. An all-zero field is inert.
- `Lenia.seed()` creates radius-scale blobs; uniform per-cell noise mostly cancels under its wide kernel.

`randomize(density, mode)` bypasses specialized seeding. Reserve it for rules whose semantics you understand. Modes are `"first"`, `"all"`, and `"independent"`.

## Parameters and structural changes

Every `Automaton` exposes:

- `paramSpecs`: parameter metadata with name, type, default, and optional range
- `get(name)` and `getValues()`
- `set(name, value)` and `setValues(values)`

Declared values are clamped, integer types are rounded, and an attached engine writes them to the parameter uniform without rebuilding:

```ts
reaction.set("feed", 0.046);
reaction.setFeed(0.046);
```

Structural values rebuild pipelines or buffers:

- `Neural.setMode(...)`
- `Neural.setChannels(...)`
- `Neural.setHidden(...)`
- `Neural.reseed(...)`
- `Lenia.setRadius(...)`

Do not drive structural setters from animation or pointer loops.

Use `engine.setAutomaton(next)` to swap rules. Then choose the new simulation rate, reset the state, and usually recenter or cover the grid:

```ts
engine.pause();
engine.setAutomaton(next);
engine.setStepsPerSecond(nextRate);
engine.reset(nextSeed);
engine.coverGrid();
engine.play();
```

## Grid and state

Create viewport-relative dimensions with:

```ts
const grid = gridForCanvas(width, height, {
  cellSize: 1.5,
  minCells: 16,
  maxCells: 1024,
});
```

Smaller `cellSize` means more cells and more GPU work. Engine grid APIs:

- `getGridSize()`
- `getChannels()`
- `resize(width, height)` — reallocates and resets buffer contents
- `setWrap(boolean)` / `getWrap()`
- `ensureGridCovers()` — grows but never shrinks, preserving existing cells
- `clear()`
- `setCells(Float32Array)`
- `reset(seedOptions)`
- `randomize(density, mode)`
- `setCell(x, y, values, fill?)`
- `seedPoint(x, y)`
- `fillCircle(cx, cy, radius, values)`

`setCells` data length must equal `width × height × channels`. `fillCircle` values are per-channel, so erasers must respect the active automaton's idle state.

## View and coordinates

Use:

- `setSize(cssWidth, cssHeight)` / `getSize()`
- `autoResize(target?)`, which returns a dispose function
- `setCamera(x, y)` / `getCamera()`
- `setZoom(zoom)` / `getZoom()`
- `getSnapshot()`
- `fitToGrid(padding?)` for an inset full-grid view
- `coverGrid()` for edge-to-edge coverage
- `setCoverMinZoom(true)` to prevent mobile zoom-out from growing the grid

The camera is measured in cell/world coordinates. Convert canvas-local pixels with:

```ts
const size = engine.getSize();
const camera = engine.getCamera();
const zoom = engine.getZoom();
const world = {
  x: camera.x + (screenX - size.width / 2) / zoom,
  y: camera.y + (screenY - size.height / 2) / zoom,
};
```

Use the canvas bounding rectangle to derive `screenX` and `screenY`; do not pass viewport `clientX/clientY` directly.

## Rendering

`setRenderConfig(partial)` updates palette and grid presentation. `getRenderConfig()` returns a copy.

Automaton descriptors can supply render hints:

- `colorMode: 0` — channel 0 through the `colorOff` to `colorOn` gradient
- `colorMode: 1` — channels 0 through 2 through per-channel gradients
- `colorMode: 2` — channels 0 through 2 as raw RGB
- `invertPalette` — swap on/off colors for high-valued idle states

Leave `RenderConfig.colorMode` undefined to respect the active automaton's hints. `Pokemon` and `Cyclic` require raw RGB; `ReactionDiffusion` uses palette inversion.

## Inspection and teardown

Metrics:

- `getFPS()`
- `getFrame()`
- `getStepsPerSecond()` / `setStepsPerSecond(value)`

`await engine.getCells()` copies the full grid from GPU storage to CPU. Use it for occasional debugging or tests, never recurring UI or interaction.

Teardown:

```ts
stopAutoResize();
engine.destroy();
```

Remove any pointer, wheel, keyboard, or window listeners owned by the application.
