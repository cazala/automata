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

  // Pointer interaction.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const isPanButton = e.button === 1 || e.button === 2 || toolRef.current === "pan";
      if (isPanButton) {
        panning.current = true;
        lastPan.current = { x: e.clientX, y: e.clientY };
      } else {
        painting.current = true;
        paintValue.current = toolRef.current === "erase" ? 0 : 1;
        paintAt(e.clientX, e.clientY);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
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
