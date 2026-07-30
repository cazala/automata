export { Engine, gridForCanvas } from "./engine";
export type {
  EngineOptions,
  RenderConfig,
  RGBA,
  RandomizeMode,
} from "./engine";

export { Automaton, createAutomaton } from "./automaton";
export type {
  AutomatonDescriptor,
  AutomatonPhase,
  BoundaryMode,
  CustomAutomatonOptions,
  ParamSpec,
  ParamType,
  RenderHints,
  SeedMode,
  SeedOptions,
  ScratchSpec,
  StorageSpec,
} from "./automaton";

export * from "./automata";

export { View } from "./view";
export type { ViewSnapshot } from "./view";
