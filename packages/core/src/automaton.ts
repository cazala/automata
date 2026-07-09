/**
 * Automaton abstraction
 *
 * An Automaton describes a cellular-automata update rule as WGSL that the engine
 * templates into a compute shader. It follows the party "descriptor" pattern but
 * WebGPU-only and specialized for a fixed cell grid:
 *
 *  - `channels`  how many f32 values each cell holds (1 for elementary/life, N for neural)
 *  - `params`    scalar uniforms the rule reads (packed into a Params uniform buffer;
 *                updating one is a realtime buffer write, no pipeline rebuild)
 *  - `storages`  named read-only storage buffers (e.g. neural weights)
 *  - `globals`   extra WGSL (structs/functions) injected before the step entrypoint
 *  - `step`      WGSL body of the per-cell update; runs with `x`,`y` (i32 cell coords)
 *                in scope plus the helpers documented in build-compute.ts
 *
 * The engine attaches a param writer and a rebuild callback so concrete automata can
 * push realtime tweaks (`set`) or request a structural rebuild (`requestRebuild`,
 * e.g. neural channel-count or weight changes).
 */

export type ParamType = "f32" | "u32" | "i32";

export interface ParamSpec {
  name: string;
  type: ParamType;
  default: number;
}

export interface StorageSpec {
  /** WGSL binding name, must be a valid identifier */
  name: string;
  data: Float32Array;
}

export interface AutomatonDescriptor {
  channels: number;
  params: ParamSpec[];
  storages?: StorageSpec[];
  /**
   * When true the engine advances a `currentRow` uniform each step (elementary CA):
   * only that row is (re)computed from the row above; all other rows are copied.
   */
  advancesRow?: boolean;
  /** Extra WGSL (structs / helper fns) injected before the `step` entrypoint. */
  globals?: string;
  /** WGSL body of the per-cell step function. */
  step: string;
}

export abstract class Automaton {
  abstract readonly name: string;

  /** Current scalar param values, keyed by ParamSpec.name. */
  protected values: Record<string, number> = {};

  private _onParam: ((name: string) => void) | null = null;
  private _onRebuild: (() => void) | null = null;

  /** Build the WGSL descriptor for the current configuration. */
  abstract build(): AutomatonDescriptor;

  /** Seed param values from the descriptor defaults (called by the engine on attach). */
  protected initDefaults(): void {
    for (const p of this.build().params) {
      if (!(p.name in this.values)) this.values[p.name] = p.default;
    }
  }

  /** Engine wiring. */
  attach(onParam: (name: string) => void, onRebuild: () => void): void {
    this._onParam = onParam;
    this._onRebuild = onRebuild;
    this.initDefaults();
  }

  detach(): void {
    this._onParam = null;
    this._onRebuild = null;
  }

  /** Read a live param value. */
  get(name: string): number {
    return this.values[name];
  }

  getValues(): Record<string, number> {
    return { ...this.values };
  }

  /** Update a scalar param (realtime; flushes the Params uniform, no rebuild). */
  protected set(name: string, value: number): void {
    this.values[name] = value;
    this._onParam?.(name);
  }

  /** Restore a bag of param values (used by import/session load). */
  setValues(values: Record<string, number>): void {
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === "number") this.values[k] = v;
    }
    // Flush everything.
    for (const k of Object.keys(values)) this._onParam?.(k);
  }

  /** Ask the engine to rebuild pipelines/buffers (structural change). */
  protected requestRebuild(): void {
    this._onRebuild?.();
  }
}
