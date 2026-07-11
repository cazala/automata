import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { countsToMask, Elementary, maskToCounts, POKEMON_TYPES, WORMS_KERNEL } from "@cazala/automata";
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
  setInit,
  ACTIVATION_GAUSSIAN,
  LIFE_PRESETS,
  type AutomatonType,
} from "../store/configSlice";
import { requestInit } from "../store/uiSlice";
import { Slider } from "./ui/Slider";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import "./Sidebar.css";

const ELEMENTARY_PRESETS = Elementary.PRESETS;

interface ChoiceOption {
  value: string;
  label: string;
}

function ChoiceGroup({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Field className={`choice-field ${className}`}>
      <label>{label}</label>
      <div className="choice-grid">
        {options.map((option) => (
          <button
            key={option.value}
            className={`choice-button ${value === option.value ? "active" : ""}`}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </Field>
  );
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

  // A tap on the handle also produces a synthetic click a few ms after
  // pointerup, dispatched at the tap's screen coordinates — by then the sheet
  // has moved, so the click would land on whatever control slid under the
  // finger (e.g. opening the sheet used to select whichever automaton button
  // ended up there). Swallow exactly that one click.
  const suppressGhostClick = () => {
    const kill = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      window.clearTimeout(timer);
    };
    document.addEventListener("click", kill, { capture: true, once: true });
    const timer = window.setTimeout(() => {
      document.removeEventListener("click", kill, { capture: true });
    }, 400);
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const el = sheetRef.current;
    dragRef.current = null;
    if (!d || !el) return;
    el.classList.remove("dragging");
    el.style.transform = "";
    suppressGhostClick();
    if (!d.moved) {
      setSheetOpen((open) => !open); // tap toggles
    } else {
      // Commit once dragged a quarter of the travel away from the starting
      // position (half the old midpoint rule); shorter drags snap back.
      const settled = clampTranslate(d, e.clientY - d.startY);
      const wasOpen = d.startTranslate === 0;
      const commit = Math.abs(settled - d.startTranslate) > d.range / 4;
      setSheetOpen(commit ? !wasOpen : wasOpen);
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
          <h3>Settings</h3>
        </div>

        <ChoiceGroup
          label="Automaton"
          value={config.type}
          onChange={(v) => dispatch(setType(v as AutomatonType))}
          className="automaton-choice"
          options={[
            { value: "neural", label: "Neural" },
            { value: "pokemon", label: "Pokemon" },
            { value: "rd", label: "Reaction" },
            { value: "lenia", label: "Lenia" },
            { value: "life", label: "Life" },
            { value: "elementary", label: "Elementary" },
          ]}
        />

        {config.type === "life" && (
          <>
            <ChoiceGroup
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
          </>
        )}

        {config.type === "elementary" && (
          <>
            <Slider
              label="Rule"
              value={config.elementary.rule}
              onChange={(v) => dispatch(setElementaryRule(v))}
              min={0}
              max={255}
              step={1}
            />
            <ChoiceGroup
              label="Preset"
              value={String(config.elementary.rule)}
              onChange={(v) => dispatch(setElementaryRule(parseInt(v)))}
              options={ELEMENTARY_PRESETS.map((r) => ({
                value: String(r),
                label: `Rule ${r}`,
              }))}
            />
          </>
        )}

        {config.type === "neural" && (
          <>
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
            <Slider
              label="Kernel center"
              value={config.neural.kCenter}
              onChange={(v) => dispatch(setNeural({ kCenter: v }))}
              min={-1}
              max={-0.5}
              step={0.01}
              formatValue={(v) => v.toFixed(2)}
            />
            <Slider
              label="Kernel edge"
              value={config.neural.kEdge}
              onChange={(v) => dispatch(setNeural({ kEdge: v }))}
              min={-1.5}
              max={-0.9}
              step={0.01}
              formatValue={(v) => v.toFixed(2)}
            />
            <Slider
              label="Kernel corner"
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
              className="sidebar-inline-action"
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
          </>
        )}

        {config.type === "pokemon" && (
          <>
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
              max={24}
              step={4}
            />
            <PokemonLegend />
          </>
        )}

        {config.type === "rd" && (
          <>
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
          </>
        )}

        {config.type === "lenia" && (
          <>
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
          </>
        )}
      </div>
      <div className="sidebar-footer">
        <Button
          variant="primary"
          className="sidebar-reset-button"
          onClick={() => engine.reset()}
          title="Reset simulation"
        >
          <RotateCcw size={16} />
          RESET SIMULATION
        </Button>
      </div>
    </div>
  );
}
