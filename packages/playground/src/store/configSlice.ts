import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  POKEMON_TYPE_COUNT,
  WORMS_GAUSS_WIDTH,
  WORMS_KERNEL,
} from "@cazala/automata";

/** Activation ids, matching the Neural automaton's `activation` param. */
export const ACTIVATION_GAUSSIAN = 3;

/** Speed-slider ceiling per automaton. */
export function maxStepsPerSecond(type: AutomatonType): number {
  return type === "rd" ? 1000 : 200;
}

/** Speed to apply when an automaton is selected. */
export function defaultStepsPerSecond(type: AutomatonType): number {
  switch (type) {
    case "pokemon":
      return 100;
    case "rd":
      return 1000;
    case "lenia":
      return 30;
    case "life":
    case "elementary":
    case "neural":
      return 120;
  }
}

export type AutomatonType =
  | "life"
  | "elementary"
  | "neural"
  | "pokemon"
  | "rd"
  | "lenia";

export interface LifeConfig {
  birth: number;
  survival: number;
}

export interface ElementaryConfig {
  rule: number;
}

export type NeuralModeUI = "network" | "direct";

export interface NeuralConfig {
  mode: NeuralModeUI;
  channels: number;
  hidden: number;
  activation: number; // 0 relu, 1 tanh, 2 sigmoid, 3 inverted gaussian
  updateRate: number;
  stepSize: number;
  aliveMask: boolean;
  seed: number;
  gaussWidth: number;
  kCenter: number;
  kEdge: number;
  kCorner: number;
}

export interface PokemonConfig {
  /** Neighbours of one attacking type needed to convert a cell (1-3). */
  threshold: number;
  /** Per-type participation flags (indexed like POKEMON_TYPES). */
  enabled: boolean[];
  /** Approximate size (cells) of the voronoi regions the grid starts as. */
  regionSize: number;
}

/** Gray-Scott reaction-diffusion parameters (all realtime). */
export interface RDConfig {
  feed: number;
  kill: number;
  diffU: number;
  diffV: number;
  dt: number;
}

export interface LeniaConfig {
  radius: number;
  mu: number;
  sigma: number;
  dt: number;
}

/** Grid dimensions derive from the canvas; edges always wrap (toroidal). */
export interface GridConfig {
  wrap: boolean;
}

export interface RenderConfigUI {
  colorOn: string;
  colorOff: string;
  colorBg: string;
  showGrid: boolean;
}

/** "noise" seeds every channel independently (neural only); "random" seeds cells whole. */
export type InitMode = "random" | "noise" | "center" | "clear";

export interface InitConfig {
  mode: InitMode;
  density: number;
}

export interface ConfigState {
  type: AutomatonType;
  life: LifeConfig;
  elementary: ElementaryConfig;
  neural: NeuralConfig;
  pokemon: PokemonConfig;
  rd: RDConfig;
  lenia: LeniaConfig;
  grid: GridConfig;
  render: RenderConfigUI;
  init: InitConfig;
  stepsPerSecond: number;
}

// Conway B3/S23 masks.
const B3 = 1 << 3;
const S23 = (1 << 2) | (1 << 3);

// Boot into the "neural worms" rule: direct conv -> inverted gaussian.
export const defaultConfig: ConfigState = {
  type: "neural",
  life: { birth: B3, survival: S23 },
  elementary: { rule: 30 },
  neural: {
    mode: "direct",
    channels: 6,
    hidden: 32,
    activation: ACTIVATION_GAUSSIAN,
    updateRate: 0.5,
    stepSize: 0.1,
    aliveMask: false,
    seed: 12345,
    gaussWidth: WORMS_GAUSS_WIDTH,
    kCenter: WORMS_KERNEL.center,
    kEdge: WORMS_KERNEL.edge,
    kCorner: WORMS_KERNEL.corner,
  },
  pokemon: {
    threshold: 3,
    enabled: new Array(POKEMON_TYPE_COUNT).fill(true),
    regionSize: 4,
  },
  rd: { feed: 0.0545, kill: 0.062, diffU: 1.0, diffV: 0.5, dt: 1.0 },
  lenia: { radius: 8, mu: 0.2, sigma: 0.027, dt: 0.1 },
  grid: { wrap: true },
  render: {
    colorOn: "#c8d8ff",
    colorOff: "#0d0d12",
    colorBg: "#05050a",
    showGrid: false,
  },
  init: { mode: "random", density: 0.2 },
  stepsPerSecond: 120,
};

const AUTOMATON_TYPES = new Set<AutomatonType>([
  "life",
  "elementary",
  "neural",
  "pokemon",
  "rd",
  "lenia",
]);

function isAutomatonType(type: unknown): type is AutomatonType {
  return typeof type === "string" && AUTOMATON_TYPES.has(type as AutomatonType);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function defaultInitForType(type: AutomatonType): InitConfig {
  return type === "lenia"
    ? { mode: "random", density: 1 }
    : { ...defaultConfig.init };
}

function constrainNeural(neural: NeuralConfig): void {
  neural.mode = "direct";
  neural.channels = 6;
  neural.activation = ACTIVATION_GAUSSIAN;
  neural.gaussWidth = clamp(finite(neural.gaussWidth, WORMS_GAUSS_WIDTH), 0.6, 0.7);
  neural.kCenter = clamp(finite(neural.kCenter, WORMS_KERNEL.center), -1, -0.5);
  neural.kEdge = clamp(finite(neural.kEdge, WORMS_KERNEL.edge), -1.5, -0.9);
  neural.kCorner = clamp(finite(neural.kCorner, WORMS_KERNEL.corner), 0.4, 0.7);
}

function constrainPokemon(pokemon: PokemonConfig): void {
  pokemon.threshold = Math.round(clamp(finite(pokemon.threshold, 3), 1, 3));
  pokemon.regionSize = clamp(finite(pokemon.regionSize, 4), 4, 24);
  if (!Array.isArray(pokemon.enabled) || pokemon.enabled.length !== POKEMON_TYPE_COUNT) {
    pokemon.enabled = new Array(POKEMON_TYPE_COUNT).fill(true);
  }
}

function constrainRD(rd: RDConfig): void {
  rd.feed = clamp(finite(rd.feed, 0.0545), 0.03, 0.07);
  rd.kill = clamp(finite(rd.kill, 0.062), 0.0575, 0.065);
  rd.diffU = clamp(finite(rd.diffU, 1.0), 0.7, 1.1);
  rd.diffV = clamp(finite(rd.diffV, 0.5), 0.25, 0.7);
  rd.dt = 1;
}

function constrainLenia(lenia: LeniaConfig): void {
  lenia.radius = Math.round(clamp(finite(lenia.radius, 8), 8, 12));
  lenia.mu = clamp(finite(lenia.mu, 0.2), 0.1, 0.3);
  lenia.sigma = clamp(finite(lenia.sigma, 0.027), 0.02, 0.06);
  lenia.dt = 0.1;
}

export function sanitizeConfig(
  input: (Partial<ConfigState> & { type?: unknown }) = {}
): ConfigState {
  const type = isAutomatonType(input.type) ? input.type : defaultConfig.type;
  const rawSteps = input.stepsPerSecond;
  const stepsPerSecond =
    typeof rawSteps === "number" && Number.isFinite(rawSteps)
      ? clamp(rawSteps, 1, maxStepsPerSecond(type))
      : defaultStepsPerSecond(type);

  const next: ConfigState = {
    type,
    life: { ...defaultConfig.life, ...input.life },
    elementary: { ...defaultConfig.elementary, ...input.elementary },
    neural: { ...defaultConfig.neural, ...input.neural },
    pokemon: { ...defaultConfig.pokemon, ...input.pokemon },
    rd: { ...defaultConfig.rd, ...input.rd },
    lenia: { ...defaultConfig.lenia, ...input.lenia },
    grid: { ...defaultConfig.grid, ...input.grid },
    render: { ...defaultConfig.render, ...input.render },
    init: { ...defaultInitForType(type), ...input.init },
    stepsPerSecond,
  };

  constrainNeural(next.neural);
  constrainPokemon(next.pokemon);
  constrainRD(next.rd);
  constrainLenia(next.lenia);
  return next;
}

const configSlice = createSlice({
  name: "config",
  initialState: defaultConfig,
  reducers: {
    setType(state, action: PayloadAction<AutomatonType>) {
      state.type = action.payload;
      state.stepsPerSecond = defaultStepsPerSecond(action.payload);
      if (action.payload === "lenia") {
        state.init.mode = "random";
        state.init.density = 1;
      }
    },
    setLife(state, action: PayloadAction<Partial<LifeConfig>>) {
      Object.assign(state.life, action.payload);
    },
    setElementaryRule(state, action: PayloadAction<number>) {
      state.elementary.rule = action.payload;
    },
    setNeural(state, action: PayloadAction<Partial<NeuralConfig>>) {
      Object.assign(state.neural, action.payload);
      constrainNeural(state.neural);
    },
    setPokemon(state, action: PayloadAction<Partial<PokemonConfig>>) {
      Object.assign(state.pokemon, action.payload);
      constrainPokemon(state.pokemon);
    },
    /**
     * Flip one type's participation. Lives in the reducer (not the component)
     * so rapid clicks each apply to current state instead of a stale render.
     * Keeps at least two types in play — one alone has nothing to battle.
     */
    togglePokemonType(state, action: PayloadAction<number>) {
      const enabled = state.pokemon.enabled;
      const i = action.payload;
      if (i < 0 || i >= enabled.length) return;
      const onCount = enabled.filter(Boolean).length;
      if (enabled[i] && onCount <= 2) return;
      enabled[i] = !enabled[i];
    },
    setRD(state, action: PayloadAction<Partial<RDConfig>>) {
      Object.assign(state.rd, action.payload);
      constrainRD(state.rd);
    },
    setLenia(state, action: PayloadAction<Partial<LeniaConfig>>) {
      Object.assign(state.lenia, action.payload);
      constrainLenia(state.lenia);
    },
    setGrid(state, action: PayloadAction<Partial<GridConfig>>) {
      Object.assign(state.grid, action.payload);
    },
    setRender(state, action: PayloadAction<Partial<RenderConfigUI>>) {
      Object.assign(state.render, action.payload);
    },
    setInit(state, action: PayloadAction<Partial<InitConfig>>) {
      Object.assign(state.init, action.payload);
    },
    setStepsPerSecond(state, action: PayloadAction<number>) {
      state.stepsPerSecond = clamp(action.payload, 1, maxStepsPerSecond(state.type));
    },
    loadConfig(_state, action: PayloadAction<ConfigState>) {
      return sanitizeConfig(action.payload);
    },
  },
});

export const {
  setType,
  setLife,
  setElementaryRule,
  setNeural,
  setPokemon,
  togglePokemonType,
  setRD,
  setLenia,
  setGrid,
  setRender,
  setInit,
  setStepsPerSecond,
  loadConfig,
} = configSlice.actions;

export default configSlice.reducer;
