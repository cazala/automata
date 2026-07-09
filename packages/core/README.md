# @cazala/automata

WebGPU cellular-automata engine. Simulate elementary (1D Wolfram), 2D life-like
(Conway), and neural cellular automata with real-time parameter tuning. WebGPU-only.

```bash
npm install @cazala/automata
```

## Concepts

The world is a fixed 2D **cell grid** of `width × height × channels` f32 values, stored
in two ping-pong storage buffers on the GPU. Each step, a compute shader reads a cell's
neighborhood from the source buffer and writes the next state to the destination buffer.

An **Automaton** describes the update rule as WGSL that the engine templates into the
compute shader. Three are built in: `Life`, `Elementary`, `Neural`. Changing an
automaton's scalar parameters is a realtime uniform write (no rebuild); changing the
automaton, grid size, or channel count rebuilds the GPU pipelines.

## Engine

```ts
const engine = new Engine({
  canvas,                                   // HTMLCanvasElement
  automaton,                                // Life | Elementary | Neural
  grid: { width, height, wrap },            // wrap = toroidal edges
  stepsPerSecond,                           // simulation rate (render is per-frame)
  render: { colorOn, colorOff, colorBg, showGrid, gridThreshold },
});

await engine.initialize();
```

Lifecycle: `initialize()`, `play()`, `pause()`, `toggle()`, `step()` (one generation),
`stop()`, `destroy()`, `isPlaying()`, `getFPS()`, `setStepsPerSecond(n)`.

State: `clear()`, `randomize(density)`, `setCell(x, y, values)`, `seedPoint(x, y)`,
`setCells(data)`, `getCells()` (async readback), `resize(w, h)`, `setWrap(bool)`.

View: `setCamera(x, y)`, `getCamera()`, `setZoom(z)`, `getZoom()`, `setSize(w, h)`,
`fitToGrid()`. World↔screen: `world = camera + (screenPx - size/2) / zoom`.

Automaton / render: `setAutomaton(a)`, `getAutomaton()`, `setRenderConfig(cfg)`,
`export()` / `import(values)`.

## Automata

```ts
new Life({ birth, survival });        // 9-bit neighbor masks; countsToMask([3]) helper
new Elementary({ rule });             // 0–255
new Neural({ channels, hidden, seed, activation, updateRate, stepSize, aliveMask });
```

- `Life.setBirth/setSurvival`, `countsToMask`, `maskToCounts`.
- `Elementary.setRule`.
- `Neural.setActivation/setUpdateRate/setStepSize/setAliveMask` (realtime),
  `setChannels/setHidden/reseed` (rebuild).

## Custom automata

Extend `Automaton` and return a descriptor from `build()`. The `step` WGSL runs per cell
with `x`, `y` (i32) in scope and helpers `sampleAt(x, y, c)`, `setCell(x, y, c, v)`,
`rand01(seed)`, plus `params.<name>` and `sim.width/height/channels`.

```ts
class MyRule extends Automaton {
  readonly name = "my-rule";
  build() {
    return {
      channels: 1,
      params: [{ name: "threshold", type: "f32", default: 0.5 }],
      step: `setCell(x, y, 0, select(0.0, 1.0, sampleAt(x, y, 0) > params.threshold));`,
    };
  }
}
```

## License

MIT
