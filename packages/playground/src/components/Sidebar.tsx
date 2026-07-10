import { useEffect, useRef, useState } from "react";
import { countsToMask, maskToCounts, POKEMON_TYPES, WORMS_KERNEL } from "@cazala/automata";
import { useEngine } from "../engine/EngineProvider";
import { useAppDispatch, useAppSelector } from "../store";
import {
  setType,
  setLife,
  setElementaryRule,
  setNeural,
  setPokemon,
  togglePokemonType,
  setRD,
  setRender,
  setInit,
  ACTIVATION_GAUSSIAN,
  type AutomatonType,
  type InitMode,
  type NeuralConfig,
  type NeuralModeUI,
} from "../store/configSlice";
import { requestInit } from "../store/uiSlice";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { Slider } from "./ui/Slider";
import { Dropdown } from "./ui/Dropdown";
import { Checkbox } from "./ui/Checkbox";
import { ColorInput } from "./ui/ColorInput";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import { NumberInput } from "./ui/NumberInput";
import "./Sidebar.css";

const LIFE_PRESETS: Record<string, { birth: number[]; survival: number[] }> = {
  conway: { birth: [3], survival: [2, 3] },
  highlife: { birth: [3, 6], survival: [2, 3] },
  seeds: { birth: [2], survival: [] },
  daynight: { birth: [3, 6, 7, 8], survival: [3, 4, 6, 7, 8] },
  maze: { birth: [3], survival: [1, 2, 3, 4, 5] },
  replicator: { birth: [1, 3, 5, 7], survival: [1, 3, 5, 7] },
};

const ELEMENTARY_PRESETS = [30, 54, 60, 90, 110, 150, 184, 250];

/**
 * Neural CA presets: bundles of the direct-mode kernel/activation knobs (plus
 * one showcasing the random-MLP substrate), each with the initial state it
 * develops best from. Verified conv->activation pattern rules.
 */
const NEURAL_PRESETS: Record<
  string,
  {
    label: string;
    values: Partial<NeuralConfig>;
    init: { mode: InitMode; density: number };
  }
> = {
  worms: {
    label: "Worms",
    values: {
      mode: "direct",
      activation: ACTIVATION_GAUSSIAN,
      gaussWidth: 0.6,
      kCenter: WORMS_KERNEL.center,
      kEdge: WORMS_KERNEL.edge,
      kCorner: WORMS_KERNEL.corner,
    },
    init: { mode: "random", density: 0.2 },
  },
  mitosis: {
    label: "Mitosis",
    values: {
      mode: "direct",
      activation: ACTIVATION_GAUSSIAN,
      gaussWidth: 1.3,
      kCenter: 0.4,
      kEdge: 0.88,
      kCorner: -0.94,
    },
    init: { mode: "noise", density: 0.5 },
  },
  mosaic: {
    label: "Mosaic",
    values: {
      mode: "direct",
      activation: ACTIVATION_GAUSSIAN,
      gaussWidth: 0.6,
      kCenter: 0.66,
      kEdge: 0.9,
      kCorner: -0.68,
    },
    init: { mode: "noise", density: 0.5 },
  },
  network: {
    label: "Random network",
    values: {
      mode: "network",
      activation: 1, // tanh
      updateRate: 0.5,
      stepSize: 0.1,
    },
    init: { mode: "random", density: 0.2 },
  },
};

/** Classic Gray-Scott (feed, kill) operating points. */
const RD_PRESETS: Record<string, { label: string; feed: number; kill: number }> = {
  coral: { label: "Coral growth", feed: 0.0545, kill: 0.062 },
  mitosis: { label: "Mitosis", feed: 0.0367, kill: 0.0649 },
  solitons: { label: "Solitons", feed: 0.03, kill: 0.062 },
  worms: { label: "Worms", feed: 0.046, kill: 0.063 },
  waves: { label: "Waves", feed: 0.014, kill: 0.045 },
};

const approx = (a: number, b: number) => Math.abs(a - b) < 0.005;
const approxTight = (a: number, b: number) => Math.abs(a - b) < 0.0005;

function detectRDPreset(rd: { feed: number; kill: number }): string {
  for (const [key, p] of Object.entries(RD_PRESETS)) {
    if (approxTight(rd.feed, p.feed) && approxTight(rd.kill, p.kill)) return key;
  }
  return "custom";
}

function detectNeuralPreset(neural: NeuralConfig): string {
  for (const [key, preset] of Object.entries(NEURAL_PRESETS)) {
    const v = preset.values;
    const matches = Object.entries(v).every(([k, val]) => {
      const cur = neural[k as keyof NeuralConfig];
      return typeof val === "number" && typeof cur === "number"
        ? approx(cur, val)
        : cur === val;
    });
    if (matches) return key;
  }
  return "custom";
}

function NeighborMask({
  label,
  mask,
  onChange,
}: {
  label: string;
  mask: number;
  onChange: (mask: number) => void;
}) {
  const counts = maskToCounts(mask);
  const toggle = (n: number) => {
    const set = new Set(counts);
    if (set.has(n)) set.delete(n);
    else set.add(n);
    onChange(countsToMask([...set]));
  };
  return (
    <Field>
      <label>{label}</label>
      <div className="mask-grid">
        {Array.from({ length: 9 }, (_, n) => (
          <button
            key={n}
            className={`mask-cell ${counts.includes(n) ? "on" : ""}`}
            onClick={() => toggle(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </Field>
  );
}

function formatCount(n: number): string {
  if (n < 1e3) return String(Math.floor(n));
  if (n < 1e6) return (n / 1e3).toFixed(1) + "K";
  if (n < 1e9) return (n / 1e6).toFixed(2) + "M";
  if (n < 1e12) return (n / 1e9).toFixed(2) + "B";
  return (n / 1e12).toFixed(2) + "T";
}

/**
 * Type legend with live occupancy percentages, sorted by share, plus a
 * running battle counter (one battle per cell per step). Clicking a type
 * toggles its participation and relaunches the simulation. Polls the grid
 * every 500ms (a GPU readback) while the pokemon automaton is active —
 * the component only mounts then, so the cost is scoped.
 */
function PokemonLegend() {
  const engine = useEngine();
  const dispatch = useAppDispatch();
  const enabled = useAppSelector((s) => s.config.pokemon.enabled);
  const [pcts, setPcts] = useState<number[]>(() =>
    new Array(POKEMON_TYPES.length).fill(0)
  );
  const [battles, setBattles] = useState(0);
  const battleRef = useRef({ frame: 0, total: 0 });

  const toggleType = (index: number) => {
    dispatch(togglePokemonType(index));
  };

  useEffect(() => {
    let cancelled = false;
    // GPU readbacks can outlast the poll interval (throttled/occluded tabs);
    // never let them overlap or they pile up and stall the renderer.
    let inFlight = false;
    const tick = async () => {
      const e = engine.engineRef.current;
      if (!e || inFlight) return;
      const ch = e.getChannels();
      if (ch < 4) return;

      // One battle per cell per step; frame resets when the automaton swaps.
      const frame = e.getFrame();
      const { width, height } = e.getGridSize();
      const st = battleRef.current;
      if (frame < st.frame) st.total = frame * width * height;
      else st.total += (frame - st.frame) * width * height;
      st.frame = frame;
      setBattles(st.total);

      inFlight = true;
      try {
        const cells = await e.getCells();
        if (cancelled || cells.length === 0) return;
        const counts = new Array(POKEMON_TYPES.length).fill(0);
        const n = cells.length / ch;
        for (let i = 0; i < n; i++) {
          const t = Math.round(cells[i * ch + 3]);
          if (t >= 0 && t < counts.length) counts[t]++;
        }
        setPcts(counts.map((c) => (100 * c) / n));
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [engine]);

  const rows = POKEMON_TYPES.map((t, i) => ({
    ...t,
    index: i,
    pct: pcts[i],
    on: enabled[i] ?? true,
  })).sort((a, b) => Number(b.on) - Number(a.on) || b.pct - a.pct);

  return (
    <Field>
      <label>Types (click to toggle)</label>
      <div className="pokemon-legend">
        {rows.map((t) => (
          <button
            key={t.name}
            className={`pokemon-type ${t.on ? "" : "off"}`}
            onClick={() => toggleType(t.index)}
            title={t.on ? `Disable ${t.name}` : `Enable ${t.name}`}
          >
            <span
              className="pokemon-swatch"
              style={{ background: `rgb(${t.color.join(",")})` }}
            />
            <span className="pokemon-name">{t.name}</span>
            <span className="pokemon-pct">{t.on ? `${t.pct.toFixed(2)}%` : "—"}</span>
          </button>
        ))}
      </div>
      <div className="pokemon-battles">
        <span className="pokemon-name">Battles</span>
        <span className="pokemon-pct">{formatCount(battles)}</span>
      </div>
    </Field>
  );
}

/** The 3x3 kernel the symmetric center/edge/corner values expand to. */
function KernelPreview({
  center,
  edge,
  corner,
}: {
  center: number;
  edge: number;
  corner: number;
}) {
  const cells = [corner, edge, corner, edge, center, edge, corner, edge, corner];
  return (
    <Field>
      <div className="kernel-preview">
        {cells.map((v, i) => (
          <span key={i} className={v < 0 ? "neg" : "pos"}>
            {v.toFixed(2)}
          </span>
        ))}
      </div>
    </Field>
  );
}

export function Sidebar() {
  const dispatch = useAppDispatch();
  const engine = useEngine();
  const config = useAppSelector((s) => s.config);

  const lifePresetValue =
    Object.entries(LIFE_PRESETS).find(
      ([, p]) =>
        countsToMask(p.birth) === config.life.birth &&
        countsToMask(p.survival) === config.life.survival
    )?.[0] ?? "custom";

  return (
    <div className="right-sidebar">
      <div className="sidebar-scroll">
        <div className="sidebar-header">
          <h3>Configuration</h3>
        </div>

        <Dropdown
          label="Automaton"
          value={config.type}
          onChange={(v) => dispatch(setType(v as AutomatonType))}
          options={[
            { value: "life", label: "Life-like (2D)" },
            { value: "elementary", label: "Elementary (1D)" },
            { value: "neural", label: "Neural CA" },
            { value: "pokemon", label: "Pokemon" },
            { value: "rd", label: "Reaction-Diffusion" },
          ]}
        />

        {config.type === "life" && (
          <CollapsibleSection title="Life rule">
            <Dropdown
              label="Preset"
              value={lifePresetValue}
              onChange={(v) => {
                const p = LIFE_PRESETS[v];
                if (p)
                  dispatch(
                    setLife({
                      birth: countsToMask(p.birth),
                      survival: countsToMask(p.survival),
                    })
                  );
              }}
              options={[
                { value: "conway", label: "Conway (B3/S23)" },
                { value: "highlife", label: "HighLife (B36/S23)" },
                { value: "seeds", label: "Seeds (B2/S)" },
                { value: "daynight", label: "Day & Night" },
                { value: "maze", label: "Maze (B3/S12345)" },
                { value: "replicator", label: "Replicator" },
                { value: "custom", label: "Custom" },
              ]}
            />
            <NeighborMask
              label="Birth (neighbors)"
              mask={config.life.birth}
              onChange={(m) => dispatch(setLife({ birth: m }))}
            />
            <NeighborMask
              label="Survival (neighbors)"
              mask={config.life.survival}
              onChange={(m) => dispatch(setLife({ survival: m }))}
            />
          </CollapsibleSection>
        )}

        {config.type === "elementary" && (
          <CollapsibleSection title="Elementary rule">
            <Slider
              label="Rule"
              value={config.elementary.rule}
              onChange={(v) => dispatch(setElementaryRule(v))}
              min={0}
              max={255}
              step={1}
            />
            <Dropdown
              label="Preset"
              value={String(config.elementary.rule)}
              onChange={(v) => dispatch(setElementaryRule(parseInt(v)))}
              options={ELEMENTARY_PRESETS.map((r) => ({
                value: String(r),
                label: `Rule ${r}`,
              }))}
            />
          </CollapsibleSection>
        )}

        {config.type === "neural" && (
          <>
            <CollapsibleSection title="Neural CA">
              <Dropdown
                label="Preset"
                value={detectNeuralPreset(config.neural)}
                onChange={(v) => {
                  const p = NEURAL_PRESETS[v];
                  if (!p) return;
                  dispatch(setNeural(p.values));
                  dispatch(setInit(p.init));
                  dispatch(requestInit());
                }}
                options={[
                  ...Object.entries(NEURAL_PRESETS).map(([value, p]) => ({
                    value,
                    label: p.label,
                  })),
                  { value: "custom", label: "Custom" },
                ]}
              />
              <Dropdown
                label="Mode"
                value={config.neural.mode}
                onChange={(v) => dispatch(setNeural({ mode: v as NeuralModeUI }))}
                options={[
                  { value: "network", label: "Network (MLP)" },
                  { value: "direct", label: "Direct (conv → activation)" },
                ]}
              />
              <Slider
                label="Channels"
                value={config.neural.channels}
                onChange={(v) => dispatch(setNeural({ channels: v }))}
                min={4}
                max={16}
                step={1}
              />
              <Dropdown
                label="Activation"
                value={String(config.neural.activation)}
                onChange={(v) => dispatch(setNeural({ activation: parseInt(v) }))}
                options={[
                  { value: "0", label: "ReLU" },
                  { value: "1", label: "Tanh" },
                  { value: "2", label: "Sigmoid" },
                  { value: "3", label: "Inverted gaussian (worms)" },
                ]}
              />
              {config.neural.activation === ACTIVATION_GAUSSIAN && (
                <Slider
                  label="Gaussian width"
                  value={config.neural.gaussWidth}
                  onChange={(v) => dispatch(setNeural({ gaussWidth: v }))}
                  min={0.05}
                  max={3}
                  step={0.05}
                  formatValue={(v) => v.toFixed(2)}
                />
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Convolution kernel">
              <Slider
                label="Center"
                value={config.neural.kCenter}
                onChange={(v) => dispatch(setNeural({ kCenter: v }))}
                min={-2}
                max={2}
                step={0.01}
                formatValue={(v) => v.toFixed(2)}
              />
              <Slider
                label="Edge"
                value={config.neural.kEdge}
                onChange={(v) => dispatch(setNeural({ kEdge: v }))}
                min={-2}
                max={2}
                step={0.01}
                formatValue={(v) => v.toFixed(2)}
              />
              <Slider
                label="Corner"
                value={config.neural.kCorner}
                onChange={(v) => dispatch(setNeural({ kCorner: v }))}
                min={-2}
                max={2}
                step={0.01}
                formatValue={(v) => v.toFixed(2)}
              />
              <KernelPreview
                center={config.neural.kCenter}
                edge={config.neural.kEdge}
                corner={config.neural.kCorner}
              />
              <Button
                onClick={() =>
                  dispatch(
                    setNeural({
                      kCenter: WORMS_KERNEL.center,
                      kEdge: WORMS_KERNEL.edge,
                      kCorner: WORMS_KERNEL.corner,
                    })
                  )
                }
              >
                Reset kernel
              </Button>
            </CollapsibleSection>

            {config.neural.mode === "network" && (
              <CollapsibleSection title="Network">
                <Slider
                  label="Hidden units"
                  value={config.neural.hidden}
                  onChange={(v) => dispatch(setNeural({ hidden: v }))}
                  min={8}
                  max={64}
                  step={8}
                />
                <Slider
                  label="Update rate"
                  value={config.neural.updateRate}
                  onChange={(v) => dispatch(setNeural({ updateRate: v }))}
                  min={0}
                  max={1}
                  step={0.01}
                  formatValue={(v) => v.toFixed(2)}
                />
                <Slider
                  label="Step size"
                  value={config.neural.stepSize}
                  onChange={(v) => dispatch(setNeural({ stepSize: v }))}
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  formatValue={(v) => v.toFixed(2)}
                />
                <Checkbox
                  label="Alive masking (needs 4+ channels)"
                  checked={config.neural.aliveMask}
                  onChange={(c) => dispatch(setNeural({ aliveMask: c }))}
                />
                <NumberInput
                  label="Weight seed"
                  value={config.neural.seed}
                  onChange={(v) => dispatch(setNeural({ seed: v }))}
                  min={0}
                  max={2 ** 31 - 1}
                  step={1}
                />
                <Button
                  onClick={() =>
                    dispatch(setNeural({ seed: (Math.random() * 1e9) | 0 }))
                  }
                >
                  Randomize seed
                </Button>
              </CollapsibleSection>
            )}
          </>
        )}

        {config.type === "pokemon" && (
          <CollapsibleSection title="Pokemon battle">
            <Slider
              label="Conversion threshold"
              value={config.pokemon.threshold}
              onChange={(v) => dispatch(setPokemon({ threshold: v }))}
              min={1}
              max={3}
              step={1}
            />
            <PokemonLegend />
          </CollapsibleSection>
        )}

        {config.type === "rd" && (
          <CollapsibleSection title="Gray-Scott model">
            <Dropdown
              label="Preset"
              value={detectRDPreset(config.rd)}
              onChange={(v) => {
                const p = RD_PRESETS[v];
                if (!p) return;
                dispatch(setRD({ feed: p.feed, kill: p.kill }));
                dispatch(requestInit());
              }}
              options={[
                ...Object.entries(RD_PRESETS).map(([value, p]) => ({
                  value,
                  label: p.label,
                })),
                { value: "custom", label: "Custom" },
              ]}
            />
            <Slider
              label="Feed rate"
              value={config.rd.feed}
              onChange={(v) => dispatch(setRD({ feed: v }))}
              min={0.005}
              max={0.12}
              step={0.0005}
              formatValue={(v) => v.toFixed(4)}
            />
            <Slider
              label="Kill rate"
              value={config.rd.kill}
              onChange={(v) => dispatch(setRD({ kill: v }))}
              min={0.03}
              max={0.08}
              step={0.0005}
              formatValue={(v) => v.toFixed(4)}
            />
            <Slider
              label="Diffusion U"
              value={config.rd.diffU}
              onChange={(v) => dispatch(setRD({ diffU: v }))}
              min={0.2}
              max={1.2}
              step={0.01}
              formatValue={(v) => v.toFixed(2)}
            />
            <Slider
              label="Diffusion V"
              value={config.rd.diffV}
              onChange={(v) => dispatch(setRD({ diffV: v }))}
              min={0.1}
              max={0.8}
              step={0.01}
              formatValue={(v) => v.toFixed(2)}
            />
            <Slider
              label="Time step"
              value={config.rd.dt}
              onChange={(v) => dispatch(setRD({ dt: v }))}
              min={0.2}
              max={1.2}
              step={0.05}
              formatValue={(v) => v.toFixed(2)}
            />
          </CollapsibleSection>
        )}

        <CollapsibleSection title="Appearance" defaultOpen={false}>
          {config.type !== "pokemon" && (
            <>
              <ColorInput
                label="On color"
                value={config.render.colorOn}
                onChange={(v) => dispatch(setRender({ colorOn: v }))}
              />
              <ColorInput
                label="Off color"
                value={config.render.colorOff}
                onChange={(v) => dispatch(setRender({ colorOff: v }))}
              />
            </>
          )}
          <ColorInput
            label="Background"
            value={config.render.colorBg}
            onChange={(v) => dispatch(setRender({ colorBg: v }))}
          />
          <Checkbox
            label="Show grid lines (when zoomed in)"
            checked={config.render.showGrid}
            onChange={(c) => dispatch(setRender({ showGrid: c }))}
          />
        </CollapsibleSection>

        {config.type !== "pokemon" && (
        <CollapsibleSection title="Initial state" defaultOpen={false}>
          <Dropdown
            label="Pattern"
            value={config.init.mode}
            onChange={(v) => dispatch(setInit({ mode: v as InitMode }))}
            options={[
              { value: "random", label: "Random soup" },
              ...(config.type === "neural"
                ? [{ value: "noise", label: "Per-channel noise" }]
                : []),
              { value: "center", label: "Center seed" },
              { value: "clear", label: "Empty" },
            ]}
          />
          <Slider
            label="Density"
            value={config.init.density}
            onChange={(v) => dispatch(setInit({ density: v }))}
            min={0}
            max={1}
            step={0.01}
            disabled={config.init.mode !== "random" && config.init.mode !== "noise"}
            formatValue={(v) => v.toFixed(2)}
          />
          <Button variant="primary" onClick={() => engine.reset()}>
            Apply initial state
          </Button>
        </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
