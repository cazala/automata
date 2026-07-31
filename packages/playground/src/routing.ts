import { countsToMask, Elementary } from "@cazala/automata";
import {
  EXPANDED_LIFE_PRESETS,
  LIFE_PRESETS,
  setElementaryRule,
  setInit,
  setLife,
  setNeural,
  setType,
  type AutomatonType,
  type ConfigState,
  type NeuralPreset,
} from "./store/configSlice";

export type AutomatonSelection =
  | { type: "neural"; preset: NeuralPreset }
  | { type: "life"; preset: string }
  | { type: "elementary"; rule: number }
  | { type: "pokemon" | "rd" | "lenia" };

export type AppRoute =
  | { kind: "home"; canonicalPath: "/" }
  | {
      kind: "selection";
      canonicalPath: string;
      selection: AutomatonSelection;
    }
  | { kind: "invalid" };

export type RouteConfigAction =
  | ReturnType<typeof setType>
  | ReturnType<typeof setLife>
  | ReturnType<typeof setElementaryRule>
  | ReturnType<typeof setNeural>
  | ReturnType<typeof setInit>;

const ELEMENTARY_PRESETS = new Set(Elementary.PRESETS);

function owns(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/** Return the named Life preset represented by the current editable values. */
export function lifePresetForConfig(config: ConfigState): string | undefined {
  const life = config.life;
  if (life.mode === "classic") {
    return Object.entries(LIFE_PRESETS).find(
      ([, preset]) =>
        countsToMask(preset.birth) === life.birth &&
        countsToMask(preset.survival) === life.survival
    )?.[0];
  }

  return Object.entries(EXPANDED_LIFE_PRESETS).find(
    ([, preset]) =>
      preset.radius === life.radius &&
      preset.states === life.states &&
      preset.birth.min === life.birthMin &&
      preset.birth.max === life.birthMax &&
      preset.survival.min === life.survivalMin &&
      preset.survival.max === life.survivalMax
  )?.[0];
}

export function pathForSelection(selection: AutomatonSelection): string {
  switch (selection.type) {
    case "neural":
      return `/neural/${
        selection.preset === "butterfly" ? "pretrained" : "procedural"
      }`;
    case "life":
      return `/life/${selection.preset}`;
    case "elementary":
      return `/elementary/${selection.rule}`;
    case "pokemon":
      return "/pokemon";
    case "rd":
      return "/reaction-diffusion";
    case "lenia":
      return "/lenia";
  }
}

/** Choose the stable, shareable route for an automaton-selection click. */
export function pathForAutomaton(
  type: AutomatonType,
  config: ConfigState
): string {
  switch (type) {
    case "neural":
      return pathForSelection({ type, preset: config.neural.preset });
    case "life":
      return pathForSelection({
        type,
        preset: lifePresetForConfig(config) ?? "conway",
      });
    case "elementary":
      return pathForSelection({
        type,
        rule: ELEMENTARY_PRESETS.has(config.elementary.rule)
          ? config.elementary.rule
          : Elementary.PRESETS[0],
      });
    case "pokemon":
    case "rd":
    case "lenia":
      return pathForSelection({ type });
  }
}

export function parseRoutePath(pathname: string): AppRoute {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  if (segments.length === 0) {
    return { kind: "home", canonicalPath: "/" };
  }

  const [automaton, preset, ...extra] = segments;
  if (extra.length > 0) return { kind: "invalid" };

  let selection: AutomatonSelection | undefined;
  switch (automaton) {
    case "neural": {
      if (!preset || preset === "procedural" || preset === "worms") {
        selection = { type: "neural", preset: "worms" };
      } else if (preset === "pretrained" || preset === "butterfly") {
        selection = { type: "neural", preset: "butterfly" };
      }
      break;
    }
    case "life": {
      const key = preset ?? "conway";
      if (owns(LIFE_PRESETS, key) || owns(EXPANDED_LIFE_PRESETS, key)) {
        selection = { type: "life", preset: key };
      }
      break;
    }
    case "elementary": {
      const rule = Number(preset ?? Elementary.PRESETS[0]);
      if (Number.isInteger(rule) && ELEMENTARY_PRESETS.has(rule)) {
        selection = { type: "elementary", rule };
      }
      break;
    }
    case "pokemon":
      if (!preset) selection = { type: "pokemon" };
      break;
    case "reaction":
    case "reaction-diffusion":
    case "rd":
      if (!preset) selection = { type: "rd" };
      break;
    case "lenia":
      if (!preset) selection = { type: "lenia" };
      break;
  }

  return selection
    ? {
        kind: "selection",
        canonicalPath: pathForSelection(selection),
        selection,
      }
    : { kind: "invalid" };
}

function normalizedRouterBase(base: string): string {
  if (!base || base === "/") return "";
  return `/${base.replace(/^\/+|\/+$/g, "")}`;
}

/**
 * Use Vite's configured base only when the current host is actually mounted
 * there. Production lives at /automata, while Cloudflare preview deployments
 * expose the same build artifact at both the origin root and /automata.
 */
export function routerBasenameForLocation(
  pathname: string,
  base = import.meta.env.BASE_URL
): string {
  const normalizedBase = normalizedRouterBase(base);
  if (!normalizedBase) return "/";
  return pathname === normalizedBase || pathname.startsWith(`${normalizedBase}/`)
    ? normalizedBase
    : "/";
}

/** Remove Vite's deployment base before parsing the initial browser URL. */
export function routePathFromLocation(
  pathname: string,
  base = import.meta.env.BASE_URL
): string {
  const normalizedBase = normalizedRouterBase(base);
  if (!normalizedBase) return pathname;
  if (pathname === normalizedBase) return "/";
  return pathname.startsWith(`${normalizedBase}/`)
    ? pathname.slice(normalizedBase.length)
    : pathname;
}

export function configActionsForSelection(
  selection: AutomatonSelection
): RouteConfigAction[] {
  const actions: RouteConfigAction[] = [setType(selection.type)];

  switch (selection.type) {
    case "neural":
      actions.push(setNeural({ preset: selection.preset }));
      break;
    case "life": {
      const classic = LIFE_PRESETS[selection.preset];
      if (classic) {
        actions.push(
          setLife({
            mode: "classic",
            birth: countsToMask(classic.birth),
            survival: countsToMask(classic.survival),
          }),
          setInit({ mode: "random", density: classic.density })
        );
        break;
      }

      const expanded = EXPANDED_LIFE_PRESETS[selection.preset];
      actions.push(
        setLife({
          mode: "larger",
          radius: expanded.radius,
          states: expanded.states,
          birthMin: expanded.birth.min,
          birthMax: expanded.birth.max,
          survivalMin: expanded.survival.min,
          survivalMax: expanded.survival.max,
        }),
        setInit({ mode: "random", density: expanded.density })
      );
      break;
    }
    case "elementary":
      actions.push(setElementaryRule(selection.rule));
      break;
    case "pokemon":
    case "rd":
    case "lenia":
      break;
  }

  return actions;
}

export function selectionMatchesConfig(
  selection: AutomatonSelection,
  config: ConfigState
): boolean {
  if (selection.type !== config.type) return false;
  switch (selection.type) {
    case "neural":
      return selection.preset === config.neural.preset;
    case "life":
      return selection.preset === lifePresetForConfig(config);
    case "elementary":
      return selection.rule === config.elementary.rule;
    case "pokemon":
    case "rd":
    case "lenia":
      return true;
  }
}
