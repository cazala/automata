import { useEffect, useRef } from "react";
import { useEngine } from "../engine/EngineProvider";
import { useAppSelector } from "../store";
import "./Canvas.css";

/**
 * What a primary click/touch drag does, per automaton:
 *  - erase: clear a circular brush of cells (neural, reaction, lenia, life)
 *  - pan:   move the camera (pokemon — cell surgery would just get eaten by
 *           the battle rule, so the gesture is better spent navigating)
 *  - none:  inert (elementary — the row-by-row history isn't editable)
 * Two-finger pinch zoom and wheel zoom work everywhere regardless.
 */
type InteractionMode = "erase" | "pan" | "none";

function interactionFor(type: string): InteractionMode {
  if (type === "pokemon") return "pan";
  if (type === "elementary") return "none";
  return "erase";
}

export function Canvas() {
  const engine = useEngine();
  const automatonType = useAppSelector((s) => s.config.type);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const modeRef = useRef<InteractionMode>(interactionFor(automatonType));
  modeRef.current = interactionFor(automatonType);

  // State kept in refs to avoid re-binding listeners.
  const erasing = useRef(false);
  const panning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
  // Previous eraser stamp in world coords, for stroke interpolation.
  const lastErase = useRef<{ x: number; y: number } | null>(null);

  // Init engine once the canvas is mounted.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    void engine.init(canvas).catch((err) => {
      if (!cancelled) console.error("Failed to initialize engine:", err);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize observer -> keep drawing buffer in sync with the container.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const ro = new ResizeObserver(() => {
      engine.resizeCanvas(parent.clientWidth, parent.clientHeight);
    });
    ro.observe(parent);
    engine.resizeCanvas(parent.clientWidth, parent.clientHeight);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel zoom (non-passive so we can preventDefault).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      engine.handleWheel(e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eraseAtClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const world = engine.screenToWorld(clientX - rect.left, clientY - rect.top);
    // Stamp along the segment from the previous point so fast drags leave a
    // continuous trail instead of a dotted line.
    const prev = lastErase.current;
    if (prev) {
      const dist = Math.hypot(world.x - prev.x, world.y - prev.y);
      const stepLen = 12; // cells; about half the eraser radius
      const steps = Math.floor(dist / stepLen);
      for (let i = 1; i <= steps; i++) {
        const t = i / (steps + 1);
        engine.eraseAt(prev.x + (world.x - prev.x) * t, prev.y + (world.y - prev.y) * t);
      }
    }
    engine.eraseAt(world.x, world.y);
    lastErase.current = world;
  };

  // Pointer interaction. Mouse: erase/pan on drag by automaton. Touch: one
  // finger does the same (erase deferred past pointerdown so a starting pinch
  // never leaves a stray stamp), two fingers pinch-zoom around their midpoint
  // and pan with it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pointers = new Map<number, { x: number; y: number }>();
    // Touch finger that hasn't erased yet (a clean tap stamps on release).
    let pendingTouchErase: number | null = null;
    let pinch: { dist: number; mid: { x: number; y: number } } | null = null;

    const pinchState = () => {
      const [a, b] = [...pointers.values()];
      return {
        dist: Math.max(20, Math.hypot(b.x - a.x, b.y - a.y)),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture can fail for exotic/synthetic pointers; tracking still works */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        // Second finger: cancel any erase/pan in progress, start pinching.
        erasing.current = false;
        panning.current = false;
        pendingTouchErase = null;
        lastErase.current = null;
        pinch = pinchState();
        return;
      }
      if (pointers.size > 2) return;

      const mode = modeRef.current;
      if (mode === "none") return;

      const isPanButton = e.button === 1 || e.button === 2;
      if (mode === "pan" || isPanButton) {
        panning.current = true;
        lastPan.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // erase mode
      if (e.pointerType === "touch") {
        pendingTouchErase = e.pointerId;
      } else {
        erasing.current = true;
        lastErase.current = null;
        eraseAtClient(e.clientX, e.clientY);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) {
        if (erasing.current) eraseAtClient(e.clientX, e.clientY);
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pinch && pointers.size >= 2) {
        const next = pinchState();
        const rect = canvas.getBoundingClientRect();
        engine.zoomAt(next.dist / pinch.dist, next.mid.x - rect.left, next.mid.y - rect.top);
        engine.panBy(next.mid.x - pinch.mid.x, next.mid.y - pinch.mid.y);
        pinch = next;
        return;
      }

      if (pendingTouchErase === e.pointerId) {
        // Finger moved without a second finger joining: it's an erase stroke.
        pendingTouchErase = null;
        erasing.current = true;
        lastErase.current = null;
      }
      if (panning.current) {
        const dx = e.clientX - lastPan.current.x;
        const dy = e.clientY - lastPan.current.y;
        lastPan.current = { x: e.clientX, y: e.clientY };
        engine.panBy(dx, dy);
      } else if (erasing.current) {
        eraseAtClient(e.clientX, e.clientY);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pendingTouchErase === e.pointerId) {
        // Clean tap: a single eraser stamp.
        lastErase.current = null;
        eraseAtClient(e.clientX, e.clientY);
        pendingTouchErase = null;
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      erasing.current = false;
      panning.current = false;
      lastErase.current = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("contextmenu", onContextMenu);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mode = interactionFor(automatonType);
  return <canvas ref={canvasRef} id="canvas" className={`interaction-${mode}`} />;
}
