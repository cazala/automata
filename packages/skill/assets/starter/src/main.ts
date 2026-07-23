import "./style.css";
import { Engine, gridForCanvas } from "@cazala/automata";
import {
  sceneFactories,
  sceneNames,
  type InteractionMode,
  type SceneName,
} from "./scenes";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#automata");
const title = requiredElement<HTMLElement>("#scene-title");
const description = requiredElement<HTMLElement>("#scene-description");
const status = requiredElement<HTMLElement>("#status");
const links = requiredElement<HTMLElement>("#scene-links");
const hint = requiredElement<HTMLElement>("#interaction-hint");
const fallback = requiredElement<HTMLElement>("#fallback");

const requestedScene = new URLSearchParams(window.location.search).get("scene");
const sceneName: SceneName = sceneNames.includes(requestedScene as SceneName)
  ? (requestedScene as SceneName)
  : "worms";
const scene = sceneFactories[sceneName]();

for (const name of sceneNames) {
  const link = document.createElement("a");
  link.href = `?scene=${name}`;
  link.textContent = name;
  if (name === sceneName) link.setAttribute("aria-current", "page");
  links.append(link);
}

title.textContent = scene.title;
description.textContent = scene.description;
hint.textContent =
  scene.interaction === "erase"
    ? "Drag to erase. Scroll to zoom."
    : scene.interaction === "pan"
      ? "Drag to pan. Scroll to zoom."
      : "Scroll to zoom.";

const maxCells = scene.maxCells ?? 1024;
const initialWidth = canvas.clientWidth || window.innerWidth;
const initialHeight = canvas.clientHeight || window.innerHeight;
const engine = new Engine({
  canvas,
  automaton: scene.automaton,
  grid: {
    ...gridForCanvas(initialWidth, initialHeight, {
      cellSize: scene.cellSize,
      maxCells,
    }),
    wrap: true,
    maxCells,
  },
  stepsPerSecond: scene.stepsPerSecond,
  render: scene.render,
  onError: (error) => {
    status.textContent = error.message;
    console.error(error);
  },
});

function canvasPoint(event: PointerEvent | WheelEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function screenToWorld(point: { x: number; y: number }): { x: number; y: number } {
  const size = engine.getSize();
  const camera = engine.getCamera();
  const zoom = engine.getZoom();
  return {
    x: camera.x + (point.x - size.width / 2) / zoom,
    y: camera.y + (point.y - size.height / 2) / zoom,
  };
}

function stamp(point: { x: number; y: number }): void {
  if (scene.interaction !== "erase") return;
  const world = screenToWorld(point);
  const values = scene.eraseValues ?? new Array(engine.getChannels()).fill(0);
  engine.fillCircle(world.x, world.y, 18, values);
}

function panBy(dx: number, dy: number): void {
  const camera = engine.getCamera();
  const zoom = engine.getZoom();
  engine.setCamera(camera.x - dx / zoom, camera.y - dy / zoom);
  engine.ensureGridCovers();
}

function zoomAt(point: { x: number; y: number }, factor: number): void {
  const before = screenToWorld(point);
  engine.setZoom(engine.getZoom() * factor);
  const after = screenToWorld(point);
  const camera = engine.getCamera();
  engine.setCamera(
    camera.x + before.x - after.x,
    camera.y + before.y - after.y
  );
  engine.ensureGridCovers();
}

function bindPointerInteraction(mode: InteractionMode): () => void {
  let activePointer: number | null = null;
  let previous = { x: 0, y: 0 };

  const onPointerDown = (event: PointerEvent) => {
    if (mode === "none") return;
    event.preventDefault();
    activePointer = event.pointerId;
    previous = canvasPoint(event);
    canvas.setPointerCapture(event.pointerId);
    stamp(previous);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (activePointer !== event.pointerId) return;
    const next = canvasPoint(event);
    if (mode === "erase") {
      const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
      const steps = Math.max(1, Math.ceil(distance / 12));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        stamp({
          x: previous.x + (next.x - previous.x) * t,
          y: previous.y + (next.y - previous.y) * t,
        });
      }
    } else if (mode === "pan") {
      panBy(next.x - previous.x, next.y - previous.y);
    }
    previous = next;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    zoomAt(canvasPoint(event), Math.exp(-event.deltaY * 0.001));
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
  };
}

async function start(): Promise<void> {
  let stopAutoResize = () => {};
  let stopPointer = () => {};
  let statusTimer = 0;

  try {
    await engine.initialize();
    engine.coverGrid();
    engine.reset(scene.seed);
    stopAutoResize = engine.autoResize();
    stopPointer = bindPointerInteraction(scene.interaction);
    engine.play();

    const refreshStatus = () => {
      const grid = engine.getGridSize();
      status.textContent =
        `WEBGPU · ${grid.width}×${grid.height} · ${Math.round(engine.getFPS())} fps`;
    };
    refreshStatus();
    statusTimer = window.setInterval(refreshStatus, 1000);
  } catch (error) {
    fallback.hidden = false;
    canvas.hidden = true;
    status.textContent =
      error instanceof Error ? error.message : "Could not start Automata";
    console.error(error);
  }

  window.addEventListener(
    "beforeunload",
    () => {
      window.clearInterval(statusTimer);
      stopPointer();
      stopAutoResize();
      engine.destroy();
    },
    { once: true }
  );
}

void start();
