import { defaultConfig, type ConfigState } from "../store/configSlice";

export const SESSION_VERSION = 2;
const INDEX_KEY = "automata-sessions-index";
const SESSION_PREFIX = "automata-session-";

export interface SessionData {
  version: number;
  id: string;
  name: string;
  createdAt: number;
  config: ConfigState;
}

export interface SessionSummary {
  id: string;
  name: string;
  createdAt: number;
}

function readIndex(): SessionSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as SessionSummary[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(index: SessionSummary[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function listSessions(): SessionSummary[] {
  return readIndex().sort((a, b) => b.createdAt - a.createdAt);
}

export function saveSession(name: string, config: ConfigState): SessionData {
  const existing = readIndex().find((s) => s.name === name);
  const id = existing?.id ?? `${SESSION_PREFIX}${Date.now()}`;
  const data: SessionData = {
    version: SESSION_VERSION,
    id,
    name,
    createdAt: Date.now(),
    config,
  };
  localStorage.setItem(id, JSON.stringify(data));
  const index = readIndex().filter((s) => s.id !== id);
  index.push({ id, name, createdAt: data.createdAt });
  writeIndex(index);
  return data;
}

export function loadSession(id: string): SessionData | null {
  try {
    const raw = localStorage.getItem(id);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function deleteSession(id: string): void {
  localStorage.removeItem(id);
  writeIndex(readIndex().filter((s) => s.id !== id));
}

/**
 * Fill in any config keys a session predates. v1 sessions carry grid.width/height
 * (now derived from the canvas) and lack the neural mode/kernel params; unknown
 * keys are harmless, missing ones are not.
 */
function migrate(data: SessionData): SessionData {
  const c = data.config ?? ({} as Partial<ConfigState>);
  data.config = {
    ...defaultConfig,
    ...c,
    life: { ...defaultConfig.life, ...c.life },
    elementary: { ...defaultConfig.elementary, ...c.elementary },
    neural: { ...defaultConfig.neural, ...c.neural },
    grid: { ...defaultConfig.grid, ...c.grid },
    render: { ...defaultConfig.render, ...c.render },
    init: { ...defaultConfig.init, ...c.init },
  };
  data.version = SESSION_VERSION;
  return data;
}

export function isValidSession(data: unknown): data is SessionData {
  const d = data as SessionData;
  return !!d && typeof d === "object" && !!d.config && typeof d.config === "object";
}

export function downloadSession(data: SessionData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.name || "session"}.automata.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readSessionFile(file: File): Promise<SessionData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (isValidSession(data)) resolve(migrate(data));
        else reject(new Error("Invalid session file"));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
