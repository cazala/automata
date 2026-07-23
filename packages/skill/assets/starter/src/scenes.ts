import {
  type Automaton,
  Cyclic,
  Lenia,
  Life,
  Neural,
  Pokemon,
  ReactionDiffusion,
  type RenderConfig,
  type SeedOptions,
  countsToMask,
} from "@cazala/automata";

export type SceneName =
  | "worms"
  | "mitosis"
  | "lenia"
  | "pokemon"
  | "maze"
  | "cyclic";

export type InteractionMode = "erase" | "pan" | "none";

export type Scene = {
  title: string;
  description: string;
  automaton: Automaton;
  stepsPerSecond: number;
  cellSize: number;
  maxCells?: number;
  seed?: SeedOptions;
  render: Partial<RenderConfig>;
  interaction: InteractionMode;
  eraseValues?: number[];
};

type SceneFactory = () => Scene;

const rgba = (hex: number): { r: number; g: number; b: number; a: number } => ({
  r: ((hex >> 16) & 0xff) / 255,
  g: ((hex >> 8) & 0xff) / 255,
  b: (hex & 0xff) / 255,
  a: 1,
});

function palette(
  colorOn: number,
  colorOff: number,
  colorBg = colorOff
): Partial<RenderConfig> {
  return {
    colorOn: rgba(colorOn),
    colorOff: rgba(colorOff),
    colorBg: rgba(colorBg),
    showGrid: false,
  };
}

function createWorms(): Scene {
  const automaton = new Neural();
  const seed = automaton.applyPreset("worms");
  return {
    title: "Neural worms",
    description: "A convolution and inverted Gaussian organize noise into luminous moving filaments.",
    automaton,
    stepsPerSecond: Neural.recommendedStepsPerSecond,
    cellSize: 1.6,
    seed,
    render: palette(0xd8efff, 0x080b13, 0x04060b),
    interaction: "erase",
    eraseValues: [0, 0, 0, 0, 0, 0],
  };
}

function createMitosis(): Scene {
  const automaton = new ReactionDiffusion();
  automaton.applyPreset("mitosis");
  return {
    title: "Gray-Scott mitosis",
    description: "Ragged chemical seeds divide into a field of warm cellular spots.",
    automaton,
    stepsPerSecond: ReactionDiffusion.recommendedStepsPerSecond,
    cellSize: 1,
    maxCells: 1536,
    seed: { mode: "random", density: 0.2 },
    render: palette(0xffd08a, 0x11152a, 0x070914),
    interaction: "erase",
    eraseValues: [1, 0],
  };
}

function createLenia(): Scene {
  const automaton = new Lenia({
    radius: 8,
    mu: 0.2,
    sigma: 0.027,
    dt: 0.1,
  });
  return {
    title: "Lenia organisms",
    description: "Continuous ring-kernel growth forms soft, near-critical islands.",
    automaton,
    stepsPerSecond: Lenia.recommendedStepsPerSecond,
    cellSize: 2.2,
    maxCells: 896,
    seed: { mode: "random", density: 1 },
    render: palette(0xf5f0cb, 0x17201c, 0x080d0b),
    interaction: "erase",
    eraseValues: [0],
  };
}

function createPokemon(): Scene {
  return {
    title: "Pokémon type battle",
    description: "Eighteen colored domains consume one another along super-effective borders.",
    automaton: new Pokemon({ threshold: 3, regionSize: 7 }),
    stepsPerSecond: Pokemon.recommendedStepsPerSecond,
    cellSize: 2,
    seed: { mode: "random" },
    render: palette(0xffffff, 0x07070b),
    interaction: "pan",
  };
}

function createMaze(): Scene {
  const preset = Life.PRESETS.maze;
  return {
    title: "Life-like maze",
    description: "A sparse B3/S12345 soup grows into branching binary corridors.",
    automaton: new Life({
      birth: countsToMask(preset.birth),
      survival: countsToMask(preset.survival),
    }),
    stepsPerSecond: Life.recommendedStepsPerSecond,
    cellSize: 2,
    seed: { mode: "random", density: preset.density },
    render: {
      ...palette(0xa8ffd4, 0x0a1012, 0x050809),
      showGrid: false,
      gridThreshold: 8,
    },
    interaction: "erase",
    eraseValues: [0],
  };
}

function createCyclic(): Scene {
  return {
    title: "Cyclic spirals",
    description: "Fourteen successor states self-organize from noise into rotating color fronts.",
    automaton: new Cyclic({ states: 14, threshold: 1 }),
    stepsPerSecond: Cyclic.recommendedStepsPerSecond,
    cellSize: 1.8,
    seed: { mode: "random" },
    render: palette(0xffffff, 0x07070b),
    interaction: "pan",
  };
}

export const sceneFactories: Record<SceneName, SceneFactory> = {
  worms: createWorms,
  mitosis: createMitosis,
  lenia: createLenia,
  pokemon: createPokemon,
  maze: createMaze,
  cyclic: createCyclic,
};

export const sceneNames = Object.keys(sceneFactories) as SceneName[];
