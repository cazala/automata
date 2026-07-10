import { useEffect, useRef } from "react";
import { useEngine } from "../engine/EngineProvider";
import { useAppSelector } from "../store";
import "./Canvas.css";

export function Canvas() {
  const engine = useEngine();
  const tool = useAppSelector((s) => s.ui.tool);
  const brushSize = useAppSelector((s) => s.ui.brushSize);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const brushRef = useRef(brushSize);
  brushRef.current = brushSize;

  // State kept in refs to avoid re-binding listeners.
  const painting = useRef(false);
  const panning = useRef(false);
  const paintValue = useRef(1);
  const lastPan = useRef({ x: 0, y: 0 });

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

  const paintAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const world = engine.screenToWorld(clientX - rect.left, clientY - rect.top);
    const r = Math.max(0, brushRef.current - 1);
    const cx = Math.floor(world.x);
    const cy = Math.floor(world.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        engine.paintCell(cx + dx + 0.5, cy + dy + 0.5, paintValue.current);
      }
    }
  };

  // Pointer interaction. Mouse: paint/pan on drag as before. Touch: one
  // finger paints (deferred past pointerdown so a starting pinch never leaves
  // a stray dot), two fingers pinch-zoom around their midpoint and pan with it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pointers = new Map<number, { x: number; y: number }>();
    // Touch finger that hasn't painted yet (tap paints on release).
    let pendingTouchPaint: number | null = null;
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
        // Second finger: cancel any paint/pan in progress, start pinching.
        painting.current = false;
        panning.current = false;
        pendingTouchPaint = null;
        pinch = pinchState();
        return;
      }
      if (pointers.size > 2) return;

      const isPanButton = e.button === 1 || e.button === 2 || toolRef.current === "pan";
      if (isPanButton) {
        panning.current = true;
        lastPan.current = { x: e.clientX, y: e.clientY };
      } else if (e.pointerType === "touch") {
        pendingTouchPaint = e.pointerId;
        paintValue.current = toolRef.current === "erase" ? 0 : 1;
      } else {
        painting.current = true;
        paintValue.current = toolRef.current === "erase" ? 0 : 1;
        paintAt(e.clientX, e.clientY);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) {
        if (painting.current) paintAt(e.clientX, e.clientY);
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

      if (pendingTouchPaint === e.pointerId) {
        // Finger moved without a second finger joining: it's a paint stroke.
        pendingTouchPaint = null;
        painting.current = true;
      }
      if (panning.current) {
        const dx = e.clientX - lastPan.current.x;
        const dy = e.clientY - lastPan.current.y;
        lastPan.current = { x: e.clientX, y: e.clientY };
        engine.panBy(dx, dy);
      } else if (painting.current) {
        paintAt(e.clientX, e.clientY);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pendingTouchPaint === e.pointerId) {
        // Clean tap: paint a single dot.
        paintAt(e.clientX, e.clientY);
        pendingTouchPaint = null;
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      painting.current = false;
      panning.current = false;
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

  const cursorClass =
    tool === "pan" ? "pan-tool" : tool === "erase" ? "erase-tool" : "paint-tool";

  return <canvas ref={canvasRef} id="canvas" className={cursorClass} />;
}
