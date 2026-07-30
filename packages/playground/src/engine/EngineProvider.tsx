import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import {
  Engine,
  Life,
  LargerThanLife,
  Elementary,
  GrowingNeural,
  Neural,
  Pokemon,
  ReactionDiffusion,
  Lenia,
  type Activation,
  type Automaton,
  type GrowingNeuralArtifact,
  type RenderConfig,
} from "@cazala/automata";
import butterflyArtifactJson from "../assets/growing-ca-butterfly.json?raw";
import { hexToRgba } from "../utils/color";
import { isMobileDevice } from "../utils/deviceCapabilities";
import { useAppDispatch, useAppSelector } from "../store";
import { setFps, setPlaying } from "../store/uiSlice";
import type { ConfigState } from "../store/configSlice";

interface EngineApi {
  engineRef: React.MutableRefObject<Engine | null>;
  init: (canvas: HTMLCanvasElement) => Promise<void>;
  destroy: () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  step: () => void;
  reset: () => void;
  damage: () => void;
  clear: () => void;
  applyInit: () => void;
  eraseAt: (worldX: number, worldY: number) => void;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  handleWheel: (deltaY: number, cx: number, cy: number) => void;
  zoomAt: (factor: number, cx: number, cy: number) => void;
  panBy: (dxCss: number, dyCss: number) => void;
  resizeCanvas: (cssW: number, cssH: number) => void;
  setGrowingViewportSize: (
    visibleWidth?: number,
    visibleHeight?: number
  ) => void;
  resetView: () => void;
}

const EngineContext = createContext<EngineApi | null>(null);

export function useEngine(): EngineApi {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error("useEngine must be used within EngineProvider");
  return ctx;
}

const MIN_CELLS = 16;
const MAX_CELLS = 2048;

/**
 * Initial cell size in CSS pixels. The grid is sized so every display boots at
 * this cell size regardless of resolution (a 2560px-wide desktop gets ~1707
 * cells, a 390px-wide phone ~260), capped at MAX_CELLS on huge screens.
 * ensureGridCovers() keeps the coverage as the user zooms/resizes after that.
 */
const DEFAULT_CELL_PX = 1.5;
const REACTION_CELL_PX = 1;
const GROWING_GRID_SIZE = 72;
const GROWING_DAMAGE_RADIUS = 11;
const GROWING_POINTER_DAMAGE_RADIUS = GROWING_DAMAGE_RADIUS / 2;
const BUTTERFLY_ARTIFACT = JSON.parse(
  butterflyArtifactJson
) as GrowingNeuralArtifact;

function isGrowingNeural(config: ConfigState): boolean {
  return config.type === "neural" && config.neural.preset === "butterfly";
}

/** Fit the square Growing-NCA grid inside the unobscured canvas area. */
function fitGrowingToViewport(
  engine: Engine,
  requestedVisibleWidth?: number,
  requestedVisibleHeight?: number
): void {
  const size = engine.getSize();
  const grid = engine.getGridSize();
  const visibleWidth = Math.max(
    1,
    Math.min(size.width, requestedVisibleWidth ?? size.width)
  );
  const visibleHeight = Math.max(
    1,
    Math.min(size.height, requestedVisibleHeight ?? size.height)
  );
  const zoom =
    Math.min(visibleWidth / grid.width, visibleHeight / grid.height) * 0.9;
  engine.setZoom(zoom);
  engine.setCamera(
    grid.width / 2 + (size.width - visibleWidth) / (2 * zoom),
    grid.height / 2 + (size.height - visibleHeight) / (2 * zoom)
  );
}

const clampCells = (n: number) =>
  Math.max(MIN_CELLS, Math.min(MAX_CELLS, Math.round(n)));

function cellPxForType(type: ConfigState["type"]): number {
  return type === "rd" ? REACTION_CELL_PX : DEFAULT_CELL_PX;
}

function gridForCanvas(cssW: number, cssH: number, config: ConfigState) {
  if (isGrowingNeural(config)) {
    return { width: GROWING_GRID_SIZE, height: GROWING_GRID_SIZE };
  }
  const cellPx = cellPxForType(config.type);
  return {
    width: clampCells(Math.ceil(cssW / cellPx)),
    height: clampCells(Math.ceil(cssH / cellPx)),
  };
}

function buildAutomaton(config: ConfigState): Automaton {
  switch (config.type) {
    case "life":
      if (config.life.mode === "larger") {
        return new LargerThanLife({
          radius: config.life.radius,
          states: config.life.states,
          birth: {
            min: config.life.birthMin,
            max: config.life.birthMax,
          },
          survival: {
            min: config.life.survivalMin,
            max: config.life.survivalMax,
          },
        });
      }
      return new Life({
        birth: config.life.birth,
        survival: config.life.survival,
      });
    case "elementary":
      return new Elementary({ rule: config.elementary.rule });
    case "neural":
      if (config.neural.preset === "butterfly") {
        return GrowingNeural.fromArtifact(BUTTERFLY_ARTIFACT);
      }
      return new Neural({
        mode: config.neural.mode,
        channels: config.neural.channels,
        hidden: config.neural.hidden,
        seed: config.neural.seed,
        activation: config.neural.activation as Activation,
        updateRate: config.neural.updateRate,
        stepSize: config.neural.stepSize,
        aliveMask: config.neural.aliveMask,
        gaussWidth: config.neural.gaussWidth,
        kernel: {
          center: config.neural.kCenter,
          edge: config.neural.kEdge,
          corner: config.neural.kCorner,
        },
      });
    case "pokemon":
      return new Pokemon({
        threshold: config.pokemon.threshold,
        regionSize: config.pokemon.regionSize,
        enabledTypes: config.pokemon.enabled,
      });
    case "rd":
      return new ReactionDiffusion({
        feed: config.rd.feed,
        kill: config.rd.kill,
        diffU: config.rd.diffU,
        diffV: config.rd.diffV,
        dt: config.rd.dt,
      });
    case "lenia":
      return new Lenia({
        radius: config.lenia.radius,
        mu: config.lenia.mu,
        sigma: config.lenia.sigma,
        dt: config.lenia.dt,
      });
  }
}

function renderConfigFrom(config: ConfigState): Partial<RenderConfig> {
  // Color mode and palette inversion come from each automaton's render hints
  // (AutomatonDescriptor.render); the playground only supplies the palette.
  return {
    colorOn: hexToRgba(config.render.colorOn),
    colorOff: hexToRgba(config.render.colorOff),
    colorBg: hexToRgba(config.render.colorBg),
    showGrid: config.render.showGrid,
    gridThreshold: 6,
  };
}

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const config = useAppSelector((s) => s.config);
  const initNonce = useAppSelector((s) => s.ui.initNonce);

  const engineRef = useRef<Engine | null>(null);
  const automatonRef = useRef<Automaton | null>(null);
  const growingViewportRef = useRef<{
    width?: number;
    height?: number;
  }>({});
  // Synchronous guard against React StrictMode double-invoking init before the
  // async initialize() resolves and sets engineRef.
  const initStarted = useRef(false);
  // Latest config, kept in a ref so imperative helpers see fresh values.
  const configRef = useRef(config);
  configRef.current = config;

  // ---- init pattern ---------------------------------------------------------

  const applyInit = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const cfg = configRef.current;
    // Each automaton owns its initial-state recipe (Automaton.seed); the
    // playground just forwards the user's mode/density choice.
    engine.reset(
      isGrowingNeural(cfg)
        ? { mode: "center" }
        : { mode: cfg.init.mode, density: cfg.init.density }
    );
  }, []);

  // ---- lifecycle ------------------------------------------------------------

  const init = useCallback(
    async (canvas: HTMLCanvasElement) => {
      if (initStarted.current) return;
      initStarted.current = true;
      const cfg = configRef.current;
      const automaton = buildAutomaton(cfg);
      automatonRef.current = automaton;
      const grid = gridForCanvas(
        canvas.clientWidth || window.innerWidth,
        canvas.clientHeight || window.innerHeight,
        cfg
      );
      const engine = new Engine({
        canvas,
        automaton,
        grid: {
          ...grid,
          wrap: isGrowingNeural(cfg) ? false : cfg.grid.wrap,
          maxCells: MAX_CELLS,
        },
        stepsPerSecond: cfg.stepsPerSecond,
        render: renderConfigFrom(cfg),
      });
      engineRef.current = engine;
      await engine.initialize();
      // On touch devices the boot view is the max zoom-out: pinching can only
      // zoom in, so the grid never grows past what a phone GPU handles.
      engine.setCoverMinZoom(isMobileDevice() && !isGrowingNeural(cfg));
      if (isGrowingNeural(cfg)) {
        fitGrowingToViewport(
          engine,
          growingViewportRef.current.width,
          growingViewportRef.current.height
        );
      } else engine.coverGrid();
      applyInit();
      // Start a live demo behind the homepage overlay.
      engine.play();
      dispatch(setPlaying(true));
    },
    [applyInit, dispatch]
  );

  const destroy = useCallback(() => {
    engineRef.current?.destroy();
    engineRef.current = null;
    automatonRef.current = null;
  }, []);

  // ---- controls -------------------------------------------------------------

  const play = useCallback(() => {
    engineRef.current?.play();
    dispatch(setPlaying(true));
  }, [dispatch]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    dispatch(setPlaying(false));
  }, [dispatch]);

  const toggle = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (e.isPlaying()) pause();
    else play();
  }, [play, pause]);

  const step = useCallback(() => {
    engineRef.current?.step();
  }, []);

  const clear = useCallback(() => {
    engineRef.current?.clear();
  }, []);

  const reset = useCallback(() => {
    applyInit();
  }, [applyInit]);

  const damage = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !isGrowingNeural(configRef.current)) return;
    const grid = engine.getGridSize();
    engine.fillCircle(
      grid.width / 2,
      grid.height / 2,
      GROWING_DAMAGE_RADIUS,
      new Array(engine.getChannels()).fill(0)
    );
  }, []);

  const resetView = useCallback(() => {
    engineRef.current?.coverGrid();
  }, []);

  // ---- interaction ----------------------------------------------------------

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const engine = engineRef.current;
    if (!engine) return { x: 0, y: 0 };
    const { width, height } = engine.getSize();
    const zoom = engine.getZoom();
    const camera = engine.getCamera();
    return {
      x: camera.x + (sx - width / 2) / zoom,
      y: camera.y + (sy - height / 2) / zoom,
    };
  }, []);

  /** Radius (in cells) of the click/drag eraser stamp. */
  const ERASE_RADIUS = 25;

  const eraseAt = useCallback((worldX: number, worldY: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    // "Off" is automaton-specific: Gray-Scott idles at u=1, v=0 (all-zero
    // cells would render bright through its inverted palette and re-ignite);
    // everything else clears to zero.
    const values =
      configRef.current.type === "rd"
        ? [1, 0]
        : new Array(engine.getChannels()).fill(0);
    const radius = isGrowingNeural(configRef.current)
      ? GROWING_POINTER_DAMAGE_RADIUS
      : ERASE_RADIUS;
    engine.fillCircle(worldX, worldY, radius, values);
  }, []);

  /** Zoom by a factor keeping the world point under (cx, cy) fixed. */
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      const before = screenToWorld(cx, cy);
      engine.setZoom(engine.getZoom() * factor);
      const after = screenToWorld(cx, cy);
      const camera = engine.getCamera();
      engine.setCamera(
        camera.x + (before.x - after.x),
        camera.y + (before.y - after.y)
      );
      if (!isGrowingNeural(configRef.current)) engine.ensureGridCovers();
    },
    [screenToWorld]
  );

  const handleWheel = useCallback(
    (deltaY: number, cx: number, cy: number) => {
      zoomAt(Math.pow(0.95, deltaY * 0.01), cx, cy);
    },
    [zoomAt]
  );

  const panBy = useCallback((dxCss: number, dyCss: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const zoom = engine.getZoom();
    const camera = engine.getCamera();
    engine.setCamera(camera.x - dxCss / zoom, camera.y - dyCss / zoom);
    if (!isGrowingNeural(configRef.current)) engine.ensureGridCovers();
  }, []);

  const resizeCanvas = useCallback((cssW: number, cssH: number) => {
    const engine = engineRef.current;
    if (!engine || cssW <= 0 || cssH <= 0) return;
    engine.setSize(cssW, cssH);
    if (isGrowingNeural(configRef.current)) {
      fitGrowingToViewport(
        engine,
        growingViewportRef.current.width,
        growingViewportRef.current.height
      );
    } else engine.ensureGridCovers();
  }, []);

  const setGrowingViewportSize = useCallback(
    (visibleWidth?: number, visibleHeight?: number) => {
      growingViewportRef.current = {
        width: visibleWidth,
        height: visibleHeight,
      };
      const engine = engineRef.current;
      if (engine && isGrowingNeural(configRef.current)) {
        fitGrowingToViewport(engine, visibleWidth, visibleHeight);
      }
    },
    []
  );

  // ---- config -> engine sync (dual-write realtime) --------------------------

  // Automaton type or Neural preset change: rebuild, resize, and re-seed.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const cfg = configRef.current;
    const automaton = buildAutomaton(cfg);
    automatonRef.current = automaton;
    engine.setRenderConfig(renderConfigFrom(cfg));
    engine.setAutomaton(automaton);
    engine.setWrap(isGrowingNeural(cfg) ? false : cfg.grid.wrap);
    engine.setCoverMinZoom(isMobileDevice() && !isGrowingNeural(cfg));
    const size = engine.getSize();
    const grid = gridForCanvas(size.width, size.height, cfg);
    const current = engine.getGridSize();
    if (current.width !== grid.width || current.height !== grid.height) {
      engine.resize(grid.width, grid.height);
    }
    if (isGrowingNeural(cfg)) {
      fitGrowingToViewport(
        engine,
        growingViewportRef.current.width,
        growingViewportRef.current.height
      );
    } else engine.coverGrid();
    applyInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type, config.neural.preset]);

  // Life's preset list spans two implementations. Switching between classic
  // masks and expanded ranges keeps one visible automaton but swaps the core
  // rule, then seeds it with the selected preset's density.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || config.type !== "life") return;
    const automaton = buildAutomaton(configRef.current);
    automatonRef.current = automaton;
    engine.setAutomaton(automaton);
    applyInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.life.mode]);

  // Life params.
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Life) {
      a.setBirth(config.life.birth);
      a.setSurvival(config.life.survival);
    }
  }, [config.life.birth, config.life.survival]);

  // Larger-than-Life radius is structural; ranges and state count are realtime.
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof LargerThanLife) {
      a.setRadius(config.life.radius);
      a.setStates(config.life.states);
      a.setBirthRange({
        min: config.life.birthMin,
        max: config.life.birthMax,
      });
      a.setSurvivalRange({
        min: config.life.survivalMin,
        max: config.life.survivalMax,
      });
    }
  }, [
    config.life.radius,
    config.life.states,
    config.life.birthMin,
    config.life.birthMax,
    config.life.survivalMin,
    config.life.survivalMax,
  ]);

  // Elementary params.
  useEffect(() => {
    const a = automatonRef.current;
    const engine = engineRef.current;
    if (a instanceof Elementary && engine) {
      const automaton = buildAutomaton(configRef.current);
      automatonRef.current = automaton;
      engine.setAutomaton(automaton);
      applyInit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.elementary.rule]);

  // Neural realtime params.
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Neural) {
      a.setActivation(config.neural.activation as Activation);
      a.setUpdateRate(config.neural.updateRate);
      a.setStepSize(config.neural.stepSize);
      a.setAliveMask(config.neural.aliveMask);
      a.setGaussWidth(config.neural.gaussWidth);
      a.setKernel({
        center: config.neural.kCenter,
        edge: config.neural.kEdge,
        corner: config.neural.kCorner,
      });
    }
  }, [
    config.neural.activation,
    config.neural.updateRate,
    config.neural.stepSize,
    config.neural.aliveMask,
    config.neural.gaussWidth,
    config.neural.kCenter,
    config.neural.kEdge,
    config.neural.kCorner,
  ]);

  // Neural structural params (rebuild + reapply init).
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Neural) {
      a.setMode(config.neural.mode);
      a.setChannels(config.neural.channels);
      a.setHidden(config.neural.hidden);
      applyInit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.neural.mode, config.neural.channels, config.neural.hidden]);

  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Neural) {
      a.reseed(config.neural.seed);
      applyInit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.neural.seed]);

  // Render config.
  useEffect(() => {
    engineRef.current?.setRenderConfig(renderConfigFrom(configRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.render.colorOn,
    config.render.colorOff,
    config.render.colorBg,
    config.render.showGrid,
  ]);

  // Grid wrap.
  useEffect(() => {
    if (!isGrowingNeural(configRef.current)) {
      engineRef.current?.setWrap(config.grid.wrap);
    }
  }, [config.grid.wrap]);

  // Pokemon params. Region size and type participation only shape the next
  // seed() (the toggles/slider dispatch a re-init separately).
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Pokemon) {
      a.setThreshold(config.pokemon.threshold);
      a.setRegionSize(config.pokemon.regionSize);
      a.setEnabledTypes(config.pokemon.enabled);
    }
  }, [config.pokemon.threshold, config.pokemon.regionSize, config.pokemon.enabled]);

  // Reaction-diffusion realtime params.
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof ReactionDiffusion) {
      a.setFeed(config.rd.feed);
      a.setKill(config.rd.kill);
      a.setDiffU(config.rd.diffU);
      a.setDiffV(config.rd.diffV);
      a.setDt(config.rd.dt);
    }
  }, [config.rd.feed, config.rd.kill, config.rd.diffU, config.rd.diffV, config.rd.dt]);

  // Lenia params (radius is structural and rebuilds; the rest are realtime).
  useEffect(() => {
    const a = automatonRef.current;
    if (a instanceof Lenia) {
      a.setRadius(config.lenia.radius);
      a.setMu(config.lenia.mu);
      a.setSigma(config.lenia.sigma);
      a.setDt(config.lenia.dt);
    }
  }, [config.lenia.radius, config.lenia.mu, config.lenia.sigma, config.lenia.dt]);

  // Steps per second.
  useEffect(() => {
    engineRef.current?.setStepsPerSecond(config.stepsPerSecond);
  }, [config.stepsPerSecond]);

  // Explicit re-seed requests from presets and seed controls.
  useEffect(() => {
    if (initNonce > 0) applyInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initNonce]);

  // ---- FPS ticker -----------------------------------------------------------

  useEffect(() => {
    const id = window.setInterval(() => {
      const e = engineRef.current;
      if (e) dispatch(setFps(Math.round(e.getFPS())));
    }, 500);
    return () => window.clearInterval(id);
  }, [dispatch]);

  const api: EngineApi = {
    engineRef,
    init,
    destroy,
    play,
    pause,
    toggle,
    step,
    reset,
    damage,
    clear,
    applyInit,
    eraseAt,
    screenToWorld,
    handleWheel,
    panBy,
    resizeCanvas,
    setGrowingViewportSize,
    resetView,
    zoomAt,
  };

  return <EngineContext.Provider value={api}>{children}</EngineContext.Provider>;
}
