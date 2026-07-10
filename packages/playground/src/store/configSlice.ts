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

export type AutomatonType =
  | "life"
  | "elementary"
  | "neural"
  | "pokemon"
  | "rd"
  | "brain"
  | "cyclic"
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
}

/** Gray-Scott reaction-diffusion parameters (all realtime). */
export interface RDConfig {
  feed: number;
  kill: number;
  diffU: number;
  diffV: number;
  dt: number;
}

export interface BrainConfig {
  /** Firing neighbours required to fire (default 2). */
  birth: number;
}

export interface CyclicConfig {
  states: number;
  threshold: number;
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
  brain: BrainConfig;
  cyclic: CyclicConfig;
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
    channels: 8,
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
    threshold: 2,
    enabled: new Array(POKEMON_TYPE_COUNT).fill(true),
  },
  rd: { feed: 0.0545, kill: 0.062, diffU: 1.0, diffV: 0.5, dt: 1.0 },
  brain: { birth: 2 },
  cyclic: { states: 14, threshold: 1 },
  lenia: { radius: 10, mu: 0.15, sigma: 0.023, dt: 0.1 },
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

const configSlice = createSlice({
  name: "config",
  initialState: defaultConfig,
  reducers: {
    setType(state, action: PayloadAction<AutomatonType>) {
      // Speed caps differ per automaton (RD integrates in tiny steps, so it
      // gets a higher ceiling). When the cap changes across a switch, scale
      // the current speed proportionally (200-of-200 -> 1000-of-1000); when
      // the cap is the same, leave the value untouched.
      const oldMax = maxStepsPerSecond(state.type);
      const newMax = maxStepsPerSecond(action.payload);
      if (oldMax !== newMax) {
        state.stepsPerSecond = Math.max(
          1,
          Math.min(newMax, Math.round((state.stepsPerSecond * newMax) / oldMax))
        );
      }
      state.type = action.payload;
    },
    setLife(state, action: PayloadAction<Partial<LifeConfig>>) {
      Object.assign(state.life, action.payload);
    },
    setElementaryRule(state, action: PayloadAction<number>) {
      state.elementary.rule = action.payload;
    },
    setNeural(state, action: PayloadAction<Partial<NeuralConfig>>) {
      Object.assign(state.neural, action.payload);
    },
    setPokemon(state, action: PayloadAction<Partial<PokemonConfig>>) {
      Object.assign(state.pokemon, action.payload);
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
    },
    setBrain(state, action: PayloadAction<Partial<BrainConfig>>) {
      Object.assign(state.brain, action.payload);
    },
    setCyclic(state, action: PayloadAction<Partial<CyclicConfig>>) {
      Object.assign(state.cyclic, action.payload);
    },
    setLenia(state, action: PayloadAction<Partial<LeniaConfig>>) {
      Object.assign(state.lenia, action.payload);
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
      state.stepsPerSecond = action.payload;
    },
    loadConfig(_state, action: PayloadAction<ConfigState>) {
      return action.payload;
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
  setBrain,
  setCyclic,
  setLenia,
  setGrid,
  setRender,
  setInit,
  setStepsPerSecond,
  loadConfig,
} = configSlice.actions;

export default configSlice.reducer;
