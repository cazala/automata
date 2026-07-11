/**
 * Automaton abstraction
 *
 * An Automaton describes a cellular-automata update rule as WGSL that the engine
 * templates into a compute shader, plus everything needed to run it well:
 *
 *  - `channels`   how many f32 values each cell holds
 *  - `params`     scalar uniforms the rule reads, declared once with defaults and
 *                 ranges (updating one is a realtime buffer write, no rebuild)
 *  - `storages`   named read-only storage buffers (e.g. neural weights)
 *  - `globals`    extra WGSL (structs/functions) injected before the step entrypoint
 *  - `step`       WGSL body of the per-cell update; runs with `x`,`y` (i32 cell
 *                 coords) in scope plus the helpers documented in build-compute.ts
 *  - `render`     hints for the built-in renderer (color mode, palette inversion)
 *  - `seed()`     an initial grid state the rule actually develops well from
 *
 * The engine attaches a param writer and a rebuild callback so automata can push
 * realtime tweaks (`set`) or request a structural rebuild (`requestRebuild`, e.g.
 * a neural channel-count change).
 *
 * To create a custom automaton, either subclass Automaton (see any file in
 * ./automata) or wrap a plain descriptor with `createAutomaton()`.
 */

export type ParamType = "f32" | "u32" | "i32";

export interface ParamSpec {
  name: string;
  type: ParamType;
  default: number;
  /** Inclusive bounds; `set()` clamps into them when present. */
  min?: number;
  max?: number;
}

export interface StorageSpec {
  /** WGSL binding name, must be a valid identifier */
  name: string;
  data: Float32Array;
}

/** Hints for the engine's built-in renderer. */
export interface RenderHints {
  /**
   * 0 = channel 0 through the colorOff->colorOn gradient;
   * 1 = channels 0..2 through per-channel gradients (hue-preserving);
   * 2 = channels 0..2 as raw rgb (cells carry their own palette).
   */
  colorMode?: number;
  /**
   * Swap colorOn/colorOff: for rules whose idle state is a *high* value
   * (e.g. Gray-Scott chemical U rests at 1), so an empty field renders dark.
   */
  invertPalette?: boolean;
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
  /**
   * Render only every Nth state: the engine advances the simulation in
   * multiples of this count per frame (default 1). Set to 2 for rules with a
   * period-2 phase oscillation (e.g. checkerboard dither), so a rendered
   * frame never samples the opposite phase — under GPU load, frames execute
   * irregular step counts and an alternating phase reads as flicker.
   */
  stepParity?: number;
  /** Hints for the engine's built-in renderer. */
  render?: RenderHints;
  /** Extra WGSL (structs / helper fns) injected before the `step` entrypoint. */
  globals?: string;
  /** WGSL body of the per-cell step function. */
  step: string;
}

/** How an initial grid state should be generated. */
export type SeedMode = "random" | "noise" | "center" | "clear";

export interface SeedOptions {
  mode?: SeedMode;
  /** Meaning is automaton-specific (soup probability, patch count scale, ...). */
  density?: number;
}

export abstract class Automaton {
  abstract readonly name: string;

  /** Declared scalar params (single source of truth for defaults and ranges). */
  readonly paramSpecs: ParamSpec[];

  /** Current scalar param values, keyed by ParamSpec.name. */
  protected values: Record<string, number> = {};

  private _onParam: ((name: string) => void) | null = null;
  private _onRebuild: (() => void) | null = null;

  constructor(paramSpecs: ParamSpec[] = []) {
    this.paramSpecs = paramSpecs;
    for (const p of paramSpecs) this.values[p.name] = p.default;
  }

  /** Build the WGSL descriptor for the current configuration. */
  abstract build(): AutomatonDescriptor;

  /**
   * Generate an initial grid state this rule develops well from. The base
   * implementation seeds channel 0 with a binary soup at `density`; automata
   * with structured needs (patches, mosaics, multi-channel coherence)
   * override it. Returned length is width * height * channels.
   */
  seed(width: number, height: number, options: SeedOptions = {}): Float32Array {
    const { mode = "random", density = 0.5 } = options;
    const channels = this.build().channels;
    const data = new Float32Array(width * height * channels);
    if (mode === "clear") return data;
    if (mode === "center") {
      const base =
        (Math.floor(height / 2) * width + Math.floor(width / 2)) * channels;
      for (let c = 0; c < channels; c++) data[base + c] = 1;
      return data;
    }
    for (let i = 0; i < width * height; i++) {
      if (Math.random() < density) data[i * channels] = 1;
    }
    return data;
  }

  /** Apply any option values whose keys match declared param names. */
  protected configure(options: object): void {
    const bag = options as Record<string, unknown>;
    for (const spec of this.paramSpecs) {
      const v = bag[spec.name];
      if (typeof v === "number") this.set(spec.name, v);
    }
  }

  /** Engine wiring. */
  attach(onParam: (name: string) => void, onRebuild: () => void): void {
    this._onParam = onParam;
    this._onRebuild = onRebuild;
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

  /**
   * Update a scalar param (realtime: flushes the Params uniform, no rebuild).
   * Clamped into the spec's [min, max] when declared; integer types rounded.
   */
  set(name: string, value: number): void {
    const spec = this.paramSpecs.find((p) => p.name === name);
    let v = value;
    if (spec) {
      if (spec.min !== undefined) v = Math.max(spec.min, v);
      if (spec.max !== undefined) v = Math.min(spec.max, v);
      if (spec.type !== "f32") v = Math.round(v);
    }
    this.values[name] = v;
    this._onParam?.(name);
  }

  /** Restore a bag of param values (clamped; used by import/session load). */
  setValues(values: Record<string, number>): void {
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === "number") this.set(k, v);
    }
  }

  /** Ask the engine to rebuild pipelines/buffers (structural change). */
  protected requestRebuild(): void {
    this._onRebuild?.();
  }
}

/** Everything createAutomaton needs: a descriptor plus optional behaviors. */
export interface CustomAutomatonOptions {
  name?: string;
  channels: number;
  params?: ParamSpec[];
  storages?: StorageSpec[];
  globals?: string;
  step: string;
  advancesRow?: boolean;
  stepParity?: number;
  render?: RenderHints;
  /** Optional custom initial state (defaults to a channel-0 soup). */
  seed?: (width: number, height: number, options: SeedOptions) => Float32Array;
}

/**
 * Wrap a plain WGSL descriptor into a ready-to-run Automaton — the quickest
 * way to experiment with a custom rule without subclassing:
 *
 * ```ts
 * const rule = createAutomaton({
 *   channels: 1,
 *   params: [{ name: "decay", type: "f32", default: 0.98, min: 0.5, max: 1 }],
 *   step: `setCell(x, y, 0, sampleAt(x, y, 0) * params.decay);`,
 * });
 * rule.set("decay", 0.95); // realtime
 * ```
 */
export function createAutomaton(options: CustomAutomatonOptions): Automaton {
  const specs = options.params ?? [];
  class Custom extends Automaton {
    readonly name = options.name ?? "custom";

    constructor() {
      super(specs);
    }

    build(): AutomatonDescriptor {
      return {
        channels: options.channels,
        params: specs,
        storages: options.storages,
        globals: options.globals,
        step: options.step,
        advancesRow: options.advancesRow,
        stepParity: options.stepParity,
        render: options.render,
      };
    }

    seed(width: number, height: number, seedOptions: SeedOptions = {}): Float32Array {
      if (options.seed) return options.seed(width, height, seedOptions);
      return super.seed(width, height, seedOptions);
    }
  }
  return new Custom();
}
