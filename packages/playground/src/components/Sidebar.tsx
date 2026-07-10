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
  setLenia,
  setRender,
  setInit,
  ACTIVATION_GAUSSIAN,
  type AutomatonType,
  type InitMode,
} from "../store/configSlice";
import { requestInit } from "../store/uiSlice";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { Slider } from "./ui/Slider";
import { Dropdown } from "./ui/Dropdown";
import { Checkbox } from "./ui/Checkbox";
import { ColorInput } from "./ui/ColorInput";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import "./Sidebar.css";

const LIFE_PRESETS: Record<
  string,
  { label: string; birth: number[]; survival: number[]; density: number }
> = {
  conway: {
    label: "Conway (B3/S23)",
    birth: [3],
    survival: [2, 3],
    density: 0.5,
  },
  daynight: {
    label: "Day & Night",
    birth: [3, 6, 7, 8],
    survival: [3, 4, 6, 7, 8],
    density: 0.5,
  },
  maze: {
    label: "Maze (B3/S12345)",
    birth: [3],
    survival: [1, 2, 3, 4, 5],
    density: 0.02,
  },
};

const ELEMENTARY_PRESETS = [30, 54, 60, 90, 110, 150, 184, 250];

/** Classic Gray-Scott (feed, kill) operating points. */
const RD_PRESETS: Record<string, { label: string; feed: number; kill: number }> = {
  coral: { label: "Coral growth", feed: 0.0545, kill: 0.062 },
  mitosis: { label: "Mitosis", feed: 0.0367, kill: 0.0649 },
  solitons: { label: "Solitons", feed: 0.03, kill: 0.062 },
  worms: { label: "Worms", feed: 0.046, kill: 0.063 },
};

const approxTight = (a: number, b: number) => Math.abs(a - b) < 0.0005;

function detectRDPreset(rd: { feed: number; kill: number }): string {
  for (const [key, p] of Object.entries(RD_PRESETS)) {
    if (approxTight(rd.feed, p.feed) && approxTight(rd.kill, p.kill)) return key;
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

/** Height of the always-visible sheet handle on mobile (kept in sync with CSS). */
const SHEET_HANDLE_PX = 56;

export function Sidebar() {
  const dispatch = useAppDispatch();
  const engine = useEngine();
  const config = useAppSelector((s) => s.config);

  // Mobile bottom-sheet state: on small screens the sidebar is a fixed sheet
  // showing only its handle; tap or drag the handle to open/close. Desktop
  // ignores all of this (the handle is display:none and the transform styles
  // only apply under the media query).
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startY: number;
    startTranslate: number;
    range: number;
    moved: boolean;
  } | null>(null);

  const onHandlePointerDown = (e: React.PointerEvent) => {
    const el = sheetRef.current;
    if (!el) return;
    const range = el.getBoundingClientRect().height - SHEET_HANDLE_PX;
    dragRef.current = {
      startY: e.clientY,
      startTranslate: sheetOpen ? 0 : range,
      range,
      moved: false,
    };
    el.classList.add("dragging");
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const clampTranslate = (d: { startTranslate: number; range: number }, dy: number) =>
    Math.min(Math.max(d.startTranslate + dy, 0), d.range);

  const onHandlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 6) d.moved = true;
    el.style.transform = `translateY(${clampTranslate(d, dy)}px)`;
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const el = sheetRef.current;
    dragRef.current = null;
    if (!d || !el) return;
    el.classList.remove("dragging");
    el.style.transform = "";
    if (!d.moved) {
      setSheetOpen((open) => !open); // tap toggles
    } else {
      // Snap to whichever position the sheet was released closer to.
      setSheetOpen(clampTranslate(d, e.clientY - d.startY) < d.range / 2);
    }
  };

  const lifePresetValue =
    Object.entries(LIFE_PRESETS).find(
      ([, p]) =>
        countsToMask(p.birth) === config.life.birth &&
        countsToMask(p.survival) === config.life.survival
    )?.[0] ?? "custom";

  return (
    <div ref={sheetRef} className={`right-sidebar ${sheetOpen ? "open" : ""}`}>
      <div
        className="sheet-handle"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
      >
        <span className="sheet-grabber" />
        <span className="sheet-title">Settings</span>
      </div>
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
            { value: "lenia", label: "Lenia (continuous)" },
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
                if (p) {
                  dispatch(setInit({ mode: "random", density: p.density }));
                  dispatch(requestInit());
                }
              }}
              options={[
                ...Object.entries(LIFE_PRESETS).map(([value, p]) => ({
                  value,
                  label: p.label,
                })),
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
              {config.neural.activation === ACTIVATION_GAUSSIAN && (
                <Slider
                  label="Gaussian width"
                  value={config.neural.gaussWidth}
                  onChange={(v) => dispatch(setNeural({ gaussWidth: v }))}
                  min={0.6}
                  max={0.7}
                  step={0.01}
                  formatValue={(v) => v.toFixed(2)}
                />
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Convolution kernel">
              <Slider
                label="Center"
                value={config.neural.kCenter}
                onChange={(v) => dispatch(setNeural({ kCenter: v }))}
                min={-1}
                max={-0.5}
                step={0.01}
                formatValue={(v) => v.toFixed(2)}
              />
              <Slider
                label="Edge"
                value={config.neural.kEdge}
                onChange={(v) => dispatch(setNeural({ kEdge: v }))}
                min={-1.5}
                max={-0.9}
                step={0.01}
                formatValue={(v) => v.toFixed(2)}
              />
              <Slider
                label="Corner"
                value={config.neural.kCorner}
                onChange={(v) => dispatch(setNeural({ kCorner: v }))}
                min={0.4}
                max={0.7}
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
            {/* Below ~4 the mosaic degrades toward per-cell noise, which
                deadlocks at threshold 3 (measured: size 3 halves the battle
                activity, size 2 kills it entirely). */}
            <Slider
              label="Region size"
              value={config.pokemon.regionSize}
              onChange={(v) => {
                dispatch(setPokemon({ regionSize: v }));
                dispatch(requestInit()); // re-seed with the new mosaic scale
              }}
              min={4}
              max={128}
              step={4}
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
              min={0.03}
              max={0.07}
              step={0.0005}
              formatValue={(v) => v.toFixed(4)}
            />
            <Slider
              label="Kill rate"
              value={config.rd.kill}
              onChange={(v) => dispatch(setRD({ kill: v }))}
              min={0.0575}
              max={0.065}
              step={0.0005}
              formatValue={(v) => v.toFixed(4)}
            />
            <Slider
              label="Diffusion U"
              value={config.rd.diffU}
              onChange={(v) => dispatch(setRD({ diffU: v }))}
              min={0.7}
              max={1.1}
              step={0.01}
              formatValue={(v) => v.toFixed(2)}
            />
            <Slider
              label="Diffusion V"
              value={config.rd.diffV}
              onChange={(v) => dispatch(setRD({ diffV: v }))}
              min={0.25}
              max={0.7}
              step={0.01}
              formatValue={(v) => v.toFixed(2)}
            />
          </CollapsibleSection>
        )}

        {config.type === "lenia" && (
          <CollapsibleSection title="Lenia">
            <Slider
              label="Growth center (mu)"
              value={config.lenia.mu}
              onChange={(v) => dispatch(setLenia({ mu: v }))}
              min={0.1}
              max={0.3}
              step={0.005}
              formatValue={(v) => v.toFixed(3)}
            />
            <Slider
              label="Growth width (sigma)"
              value={config.lenia.sigma}
              onChange={(v) => dispatch(setLenia({ sigma: v }))}
              min={0.02}
              max={0.06}
              step={0.001}
              formatValue={(v) => v.toFixed(3)}
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
