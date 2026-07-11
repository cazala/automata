# Architecture

How the engine works inside. Read this if you're maintaining the library,
optimizing it, or debugging something deep.

## Big picture

```
Automaton.build() ──> AutomatonDescriptor (WGSL step + params + storages + hints)
        │
        ▼
buildCompute()  ── templates the step into a full compute shader:
                   bindings for sim uniform, src/dst cell buffers,
                   params uniform, storages + helper library (sampleAt, ...)
        │
        ▼
Engine ── owns: GPUDevice, canvas context, two ping-pong cell buffers,
          compute pipeline, render pipeline, rAF loop, camera (View)
```

One compute dispatch per simulation step (8×8 workgroups over the grid); one
fullscreen render pass per animation frame, colorizing the newest buffer.

## The cell grid

`width × height × channels` f32 values in **two storage buffers** (ping-pong).
`step()` binds (src=current, dst=other), dispatches, then flips `current`.
Reads in the shader always see the previous state, so update order is
irrelevant. CPU-side writes (`setCells`, `fillCircle`, seeding) target the
*current* buffer via `queue.writeBuffer`.

## Realtime vs structural changes

- **Realtime**: `automaton.set(name, v)` → engine packs all param values into
  the params uniform (`packParams`) and writes it. Next dispatch sees it. This
  is why dragging sliders is free.
- **Structural** (`rebuild()`): automaton swap, grid resize, channel change,
  or `requestRebuild()` from an automaton (e.g. Lenia radius). Reallocates
  cell buffers if the size changed, recreates storages, recompiles the
  compute pipeline, rebuilds bind groups. The render *pipeline* is static —
  only its bind groups point at the new buffers.

Shader compile and pipeline validation errors are reported asynchronously via
`EngineOptions.onError` (default `console.error`). This exists because WebGPU
fails silently by default and a broken shader presents as a frozen simulation
at a healthy frame rate.

## The frame loop

`requestAnimationFrame` drives everything. Each frame:

1. Accumulate elapsed time; convert to N pending steps at `stepsPerSecond`.
2. Cap N at 64 (`MAX_STEPS_PER_FRAME`) and drop the backlog when hit — a slow
   frame must not snowball into an ever-larger workload (death spiral).
3. Round N *down* to a multiple of the automaton's `stepParity` (returning the
   remainder to the accumulator). Rules that oscillate between two phases
   (neural direct mode) always render the same phase this way, regardless of
   frame-timing jitter. This fixed a real, load-dependent flicker.
4. Dispatch the steps, then render once.

Render happens every frame even when paused, so camera moves stay live.
Simulation rate and display rate are fully decoupled.

Measured throughput (M-series laptop, ~900K-cell grid): Gray-Scott ~4,000
steps/s; neural direct (6ch) comfortably >1,000; Lenia R=13 ~14/s (729 reads
per cell — it's the outlier by design).

## Camera / cover system

`View` holds camera (cell coords), zoom (px/cell), and canvas size. The render
shader maps pixels to world as `world = camera + (pixel - res/2) / zoom`.

- `coverGrid()` — zoom/center so the grid exactly covers the viewport.
- `ensureGridCovers()` — called after zoom/pan/resize: if the viewport needs
  more cells than exist, the grid *grows* (in 64-cell chunks, up to
  `maxCells`) with a GPU-side row-by-row copy of the old contents into the
  center of the new buffers, and the camera shifts by the same offset — no
  shader recompile, no visible jump, nothing lost. It never shrinks; the zoom
  floor is derived from `maxCells` so zoom-out can't demand an unbounded grid.
- `setCoverMinZoom(true)` — pins the zoom floor to the current-grid cover
  level instead. Used on touch devices: boot view = max zoom-out, pinch only
  zooms in, grid never grows past what a phone GPU handles.

`setSize()` skips no-op resizes and repaints synchronously after real ones —
assigning `canvas.width` clears the canvas, and without the immediate repaint
every mobile browser-chrome collapse flashed black for a frame.

## Elementary's row trick

`advancesRow` rules get a `currentRow` uniform that increments per step; the
shader recomputes only that row and copies the rest. That's how a 1D CA's
scrolling history lives in the same 2D grid machinery.

## The render shader

Fullscreen triangle-strip pass reading the newest cell buffer directly (no
intermediate texture). Three color modes (gradient / per-channel gradient /
raw rgb) selected by automaton render hints unless the app overrides;
`invertPalette` swaps the gradient endpoints. Optional grid lines appear above
a zoom threshold.

## The playground (demo app)

React + Redux, but the engine stays vanilla — `EngineProvider.tsx` is the
entire bridge:

- `configSlice` holds all user-facing settings with sanitization/clamping and
  is the persistence format (localStorage sessions).
- Effects dual-write config changes into automaton setters (realtime) or
  rebuild paths (structural), and `engine.reset(...)` re-seeds via the
  automaton's own `seed()`.
- `Canvas.tsx` implements pointer interaction: per-automaton modes
  (erase / pan / none), a 25-cell eraser with stroke interpolation via
  `fillCircle`, pinch zoom, and touch-deferred stamping so a starting pinch
  never leaves a mark.
- The sidebar is a fixed overlay on desktop and a drag-up bottom sheet on
  mobile (same component; CSS + pointer handlers). Ghost-click suppression on
  the sheet handle is deliberate — the synthetic click after a touch lands on
  whatever slid under the finger.

## Known limits / future work

- No f16 or texture-based storage; everything is f32 storage buffers.
- Lenia would benefit from workgroup shared-memory tiling (est. 3-5×).
- One automaton per engine; no compositing of rules.
- `getCells()` readback is the only inspection path (13MB on a big grid —
  fine at 2Hz polling, don't call per frame).
