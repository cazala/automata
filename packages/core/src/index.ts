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
export type {
  NeuralOptions,
  Activation,
  NeuralMode,
  Kernel,
} from "./automata/neural";

export { Vector, degToRad, radToDeg } from "./vector";
export { View } from "./view";
export type { ViewSnapshot } from "./view";
