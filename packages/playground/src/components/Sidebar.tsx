import { countsToMask, maskToCounts, WORMS_KERNEL } from "@cazala/automata";
import { useEngine } from "../engine/EngineProvider";
import { useAppDispatch, useAppSelector } from "../store";
import {
  setType,
  setLife,
  setElementaryRule,
  setNeural,
  setGrid,
  setRender,
  setInit,
  applyWormsPreset,
  ACTIVATION_GAUSSIAN,
  type AutomatonType,
  type InitMode,
  type NeuralModeUI,
} from "../store/configSlice";
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
              <Button variant="primary" onClick={() => dispatch(applyWormsPreset())}>
                Worms preset
              </Button>
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

        <CollapsibleSection title="Grid" defaultOpen={false}>
          <Checkbox
            label="Wrap edges (toroidal)"
            checked={config.grid.wrap}
            onChange={(c) => dispatch(setGrid({ wrap: c }))}
          />
          <Button onClick={engine.resetView}>Reset view</Button>
        </CollapsibleSection>

        <CollapsibleSection title="Appearance" defaultOpen={false}>
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
      </div>
    </div>
  );
}
