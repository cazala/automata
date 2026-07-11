# The automata

Catalog of the built-in rules: what each one is, its parameters (all declared
in each class's `PARAMS` with defaults and ranges), presets, and — importantly —
how each is seeded and why. Several of these rules only look good (or work at
all) from the right initial state; the tuning notes below were established
empirically while building this library.

All params are realtime unless marked *structural* (rebuilds the pipeline).

---

## Neural (`Neural`)

Neural cellular automata with two substrates, chosen by `mode`:

- **`"direct"` (default)** — each channel independently:
  `v' = activate(conv3x3(v, kernel))`, where the kernel is symmetric
  (center/edge/corner taps) and `activate` is selectable. With the
  inverted-gaussian activation `1 - 2^(-w·v²)` and the default kernel this is
  the classic **worms** rule.
- **`"network"`** — Growing-NCA-style: 4 perception filters (identity,
  Sobel-x/y, the kernel) feed a 2-layer random-weight MLP applied as a
  residual update under a stochastic per-cell mask. Reseedable
  (`reseed(seed)`), untrained by design — a generator of alien textures.

| Param | Default | Range | Notes |
| --- | --- | --- | --- |
| `activation` | 3 (inv. gaussian) | 0-3 | relu / tanh / sigmoid / inv. gaussian |
| `gaussWidth` | 0.6 | 0.05-3 | bell width of activation 3 |
| `kCenter` / `kEdge` / `kCorner` | -0.66 / -0.9 / 0.68 | ±2 | the worms kernel |
| `updateRate`, `stepSize`, `aliveMask` | 0.5 / 0.1 / off | | network mode only |
| `channels` | 6 | 1-16 | *structural* |
| `hidden` | 32 | 1-64 | *structural*, network mode |

**Presets** (`Neural.PRESETS`, apply via `applyPreset(name)` which returns the
matching seed options): `worms`, `mitosis` (dividing blobs), `mosaic`
(checkered color domains), `network`.

**Seeding**: `"random"` seeds whole cells (all channels agree → renders as one
coherent field), `"noise"` seeds channels independently (renders as overlaid
colored patterns), `"center"` grows from a single cell. Default density 0.2.

**Quirk**: direct mode's texture oscillates between two phases on alternating
steps, so its descriptor sets `stepParity: 2` — the engine only advances it an
even number of steps per rendered frame, otherwise irregular frame timing
samples alternating phases and reads as flicker.

---

## Reaction-diffusion (`ReactionDiffusion`)

The Gray-Scott two-chemical model. Cells hold `[u, v]`:

```
u' = u + (Du·lap(u) - u·v² + F(1-u))·dt
v' = v + (Dv·lap(v) + u·v² - (F+k)·v)·dt
```

| Param | Default | Range |
| --- | --- | --- |
| `feed` (F) | 0.0545 | 0.005-0.12 |
| `kill` (k) | 0.062 | 0.03-0.08 |
| `diffU` / `diffV` | 1.0 / 0.5 | | 
| `dt` | 1.0 | 0.2-1.2 |

**Presets** (`ReactionDiffusion.PRESETS`): `coral` (default), `mitosis`,
`solitons`, `worms`, `waves`. Each is a verified (feed, kill) operating point.

**Seeding — this one bit us**: the idle state is `u=1, v=0`; patterns grow from
V patches. A perfectly symmetric, noiseless seed freezes: mitosis settles into
round spots that hold constant coverage for 12,000+ steps because nothing ever
breaks their symmetry. `seed()` therefore adds faint V noise (≤0.02) everywhere
and makes the patches ragged; with that, spots divide exponentially. Also note
all-zero cells are *inert* for Gray-Scott — even "clear" must set `u=1`.

**Rendering**: U idles high and dips where patterns form, so the descriptor
sets `invertPalette` — empty renders dark without the app doing anything.

**Speed**: integrates in tiny steps; `recommendedStepsPerSecond = 1000`.
Measured ~4,000 steps/s on a ~900K-cell grid (M-series GPU), so there is
headroom.

---

## Lenia (`Lenia`)

Continuous Life (Chan 2019): ring kernel (poly4 shell, radius R) plus a
gaussian growth function.

| Param | Default | Range | |
| --- | --- | --- | --- |
| `radius` | 8 | 4-16 | *structural*; cost scales with R² |
| `mu` | 0.2 | 0.05-0.4 | growth center |
| `sigma` | 0.027 | 0.005-0.06 | growth width |
| `dt` | 0.1 | 0.02-0.5 | |

**Tuning notes**: the classic orbium parameters (mu 0.15, sigma 0.017) are a
knife edge that dies from random seeding; sigma ≈ 0.03 saturates into solid
plateaus. The defaults sit in between: robust structured growth from random
blobs. Slide sigma toward 0.02 for the sparse near-critical regime where
discrete creatures live (and sometimes die).

**Seeding**: kernel-radius-scale blobs of continuous noise — uniform per-cell
noise mostly cancels itself under the wide kernel. Density scales blob count.

**Speed**: the heavy one — R=8 is 289 reads/cell/step. It's continuous, so
`recommendedStepsPerSecond = 30` still looks fluid.

---

## Pokemon (`Pokemon`)

An 18-type battle CA over the real super-effectiveness chart. Each step a cell
counts, per attacking type, the neighbours that are super-effective against
it; if the strongest attacker count ≥ `threshold`, the cell converts. Uniform
regions are stable — all dynamics live on the borders, which eat into each
other along the chart's many cycles.

| Knob | Default | Range | |
| --- | --- | --- | --- |
| `threshold` | 3 | 1-3 | 1 = total war, 3 = slow domain wars |
| `regionSize` | 4 | ≥2 | seeding only (voronoi region scale) |
| `enabledTypes` | all 18 | | seeding only; disabled types can never re-emerge |

**Seeding — the whole game**: `seed()` builds a voronoi mosaic of single-type
regions (jittered-grid Worley sites, toroidal distance). Per-cell random noise
deadlocks at threshold 3 — measured: ~5% of cells convert once, then frozen —
because no cell ever sees 3 aligned attackers. Coherent domains give straight
borders where the rule stays hot: from the mosaic, ~93% of cells were still
changing per 100 steps at step 3000, with 15 of 18 types alive.

Data exports: `POKEMON_TYPES` (names + canonical colors), `POKEMON_TYPE_COUNT`.

---

## Life (`Life`)

Any life-like rule via 9-bit birth/survival masks (`countsToMask([3])` etc.).

**Presets** (`Life.PRESETS`, each with the soup density it develops best from):
`conway` (0.5), `daynight` (0.5), `maze` (0.02), `coral` (0.45).

---

## Elementary (`Elementary`)

Wolfram rules 0-255 drawn row-by-row: the grid is a scrolling history, the
engine recomputes only the `currentRow` each step (`advancesRow`). Seeding is
always a single top-center cell. `Elementary.PRESETS` lists visually
interesting rules (30, 54, 60, 73, 90, 99, 101, 110, 150, 169, 250, 254).

---

## Brian's Brain (`BriansBrain`) and Cyclic (`Cyclic`)

Two more classics included in the library (not currently surfaced in the
playground):

- **Brian's Brain**: 3-state (ready/firing/refractory) glider storm; nothing is
  ever stable. Param `birth` (default 2).
- **Cyclic**: N states in a cycle, each eaten by its successor; noise
  self-organizes into rotating spirals. Params `states` (14), `threshold` (1).
  Rendered through a hue wheel baked into the shader.

---

Next: [write your own rule](custom-automata.md)
