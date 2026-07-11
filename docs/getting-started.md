# Getting started

This walks through embedding a live cellular-automata simulation in any web
page — as a hero background, a header, or a full-page canvas. No framework
required; everything is vanilla.

## 1. A canvas

```html
<canvas id="sim" style="position: fixed; inset: 0; width: 100%; height: 100%"></canvas>
```

The engine renders at the canvas's CSS size × devicePixelRatio; you control
placement purely with CSS.

## 2. Engine + automaton

```ts
import { Engine, Neural, gridForCanvas } from "@cazala/automata";

const canvas = document.getElementById("sim") as HTMLCanvasElement;

const engine = new Engine({
  canvas,
  automaton: new Neural(), // "worms" by default
  grid: gridForCanvas(canvas.clientWidth, canvas.clientHeight),
  stepsPerSecond: 120,
  render: {
    colorOn: { r: 0.78, g: 0.85, b: 1.0, a: 1 },  // pale blue
    colorOff: { r: 0.05, g: 0.05, b: 0.07, a: 1 }, // near black
  },
  onError: (err) => console.error(err), // surfaced shader errors (default)
});

await engine.initialize();
```

`gridForCanvas(w, h, { cellSize = 1.5, maxCells = 2048 })` sizes the grid so
each cell is ~1.5 CSS pixels; smaller `cellSize` = finer detail, more GPU work.

`initialize()` rejects with a descriptive error when WebGPU is unavailable —
gate on it and fall back to a static background:

```ts
try {
  await engine.initialize();
} catch {
  canvas.remove(); // no WebGPU: keep your CSS fallback
}
```

## 3. Camera, seed, go

```ts
engine.coverGrid();  // center camera, zoom so the grid exactly covers the canvas
engine.reset();      // the automaton's own initial state (see below)
engine.autoResize(); // ResizeObserver on the canvas parent -> stays covered
engine.play();
```

`reset()` matters more than it looks: it asks the automaton for the initial
state its rule is known to develop well from. Uniform random noise kills or
freezes several of these rules — each automaton ships the seeding it needs
(see [automata.md](automata.md)). You can pass options:

```ts
engine.reset({ mode: "random", density: 0.3 }); // denser soup
engine.reset({ mode: "center" });               // a single seed to grow from
```

## 4. Picking an automaton

```ts
import { ReactionDiffusion, Lenia, Life, Pokemon } from "@cazala/automata";

const rd = new ReactionDiffusion();     // coral growth by default
rd.applyPreset("mitosis");              // or dividing spots

const life = new Life();                // Conway
const preset = Life.PRESETS.daynight;   // masks + a suited soup density

const lenia = new Lenia({ radius: 10 });
```

Every automaton declares its own render hints (color mode, palette inversion)
and `recommendedStepsPerSecond` — Gray-Scott integrates in tiny steps and wants
~1000/s, Lenia is continuous and reads smoothly at ~30/s:

```ts
engine.setStepsPerSecond(ReactionDiffusion.recommendedStepsPerSecond);
```

## 5. Live parameters

Declared params update in realtime (a uniform write, no pipeline rebuild):

```ts
rd.set("feed", 0.046);       // generic, clamped to the declared range
rd.setFeed(0.046);           // or the typed accessor
rd.paramSpecs;               // [{ name, type, default, min, max }, ...] for building UI
```

Structural knobs (Lenia's `radius`, Neural's `channels`/`mode`) rebuild the
pipeline when set — still just a method call, but not something to drive from
a per-frame animation.

## 6. Interaction (optional)

```ts
// zoom around a point (e.g. wheel):
engine.setZoom(engine.getZoom() * 1.1);
engine.ensureGridCovers(); // grows the grid if needed; clamps the camera

// erase a circular area under the pointer (world/cell coordinates):
engine.fillCircle(worldX, worldY, 25, [0, 0]); // values are per-channel
```

Note the eraser values are automaton-specific: zeros are "off" for most rules,
but Gray-Scott's idle state is `[1, 0]` (chemical U full, V empty).

For a full pointer/pinch implementation, see the playground's
`Canvas.tsx` in this repo.

## Performance notes

- Grid cost scales with `width × height × channels`. `gridForCanvas` caps at
  2048 cells per axis; a fullscreen desktop grid runs ~2M cells.
- Steps per second is decoupled from render FPS; the engine caps backlog at
  64 steps/frame and drops the excess rather than death-spiraling.
- 3×3-neighborhood rules cost roughly proportional to `channels`; Lenia costs
  ~(2R+1)² reads per cell and is the heavy one — measured throughput numbers
  are in [architecture.md](architecture.md).

Next: [the automata catalog](automata.md) · [write your own rule](custom-automata.md)
