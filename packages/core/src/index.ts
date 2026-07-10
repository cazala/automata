export { Engine } from "./engine";
export type {
  EngineOptions,
  RenderConfig,
  RGBA,
  RandomizeMode,
} from "./engine";

export { Automaton } from "./automaton";
export type {
  AutomatonDescriptor,
  ParamSpec,
  ParamType,
  StorageSpec,
} from "./automaton";

export { Life, countsToMask, maskToCounts } from "./automata/life";
export type { LifeOptions } from "./automata/life";
export { Elementary } from "./automata/elementary";
export type { ElementaryOptions } from "./automata/elementary";
export { Neural, WORMS_KERNEL, WORMS_GAUSS_WIDTH } from "./automata/neural";
export { Pokemon, POKEMON_TYPES, POKEMON_TYPE_COUNT } from "./automata/pokemon";
export type { PokemonOptions, PokemonTypeInfo } from "./automata/pokemon";
export { ReactionDiffusion } from "./automata/reaction-diffusion";
export type { ReactionDiffusionOptions } from "./automata/reaction-diffusion";
export { BriansBrain } from "./automata/brain";
export type { BriansBrainOptions } from "./automata/brain";
export { Cyclic, cyclicColor } from "./automata/cyclic";
export type { CyclicOptions } from "./automata/cyclic";
export { Lenia } from "./automata/lenia";
export type { LeniaOptions } from "./automata/lenia";
export type {
  NeuralOptions,
  Activation,
  NeuralMode,
  Kernel,
} from "./automata/neural";

export { Vector, degToRad, radToDeg } from "./vector";
export { View } from "./view";
export type { ViewSnapshot } from "./view";
