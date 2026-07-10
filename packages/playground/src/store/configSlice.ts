import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { WORMS_GAUSS_WIDTH, WORMS_KERNEL } from "@cazala/automata";

/** Activation ids, matching the Neural automaton's `activation` param. */
export const ACTIVATION_GAUSSIAN = 3;

export type AutomatonType = "life" | "elementary" | "neural" | "pokemon";

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
  /** Neighbours of one attacking type needed to convert a cell (1-8). */
  threshold: number;
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
  pokemon: { threshold: 2 },
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
  setGrid,
  setRender,
  setInit,
  setStepsPerSecond,
  loadConfig,
} = configSlice.actions;

export default configSlice.reducer;
