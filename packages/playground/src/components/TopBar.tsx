import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Trash2,
  Save,
  FolderOpen,
  Paintbrush,
  Eraser,
  Move,
} from "lucide-react";
import { useEngine } from "../engine/EngineProvider";
import { useAppDispatch, useAppSelector } from "../store";
import { setActiveModal, setHomepage, setTool, type Tool } from "../store/uiSlice";
import { maxStepsPerSecond, setStepsPerSecond } from "../store/configSlice";
import { Button } from "./ui/Button";
import "./TopBar.css";

export function TopBar() {
  const dispatch = useAppDispatch();
  const engine = useEngine();
  const playing = useAppSelector((s) => s.ui.playing);
  const tool = useAppSelector((s) => s.ui.tool);
  const fps = useAppSelector((s) => s.ui.fps);
  const stepsPerSecond = useAppSelector((s) => s.config.stepsPerSecond);
  const maxSps = useAppSelector((s) => maxStepsPerSecond(s.config.type));

  const tools: { id: Tool; icon: React.ReactNode; title: string }[] = [
    { id: "paint", icon: <Paintbrush size={16} />, title: "Paint cells" },
    { id: "erase", icon: <Eraser size={16} />, title: "Erase cells" },
    { id: "pan", icon: <Move size={16} />, title: "Pan" },
  ];

  return (
    <div className="top-bar">
      <div className="topbar-left">
        <button
          className="topbar-title"
          onClick={() => {
            engine.pause();
            dispatch(setHomepage(true));
          }}
        >
          Automata <span className="topbar-title-emoji">⬡</span>
        </button>
      </div>

      <div className="topbar-center">
        <div className="button-group">
          <Button
            onClick={() => engine.toggle()}
            active={playing}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </Button>
          <Button onClick={() => engine.step()} title="Step one generation">
            <SkipForward size={16} />
          </Button>
          <Button onClick={() => engine.reset()} title="Reset to initial state">
            <RotateCcw size={16} />
          </Button>
          <Button onClick={() => engine.clear()} title="Clear grid">
            <Trash2 size={16} />
          </Button>
        </div>

        <div className="button-group">
          {tools.map((t) => (
            <Button
              key={t.id}
              onClick={() => dispatch(setTool(t.id))}
              active={tool === t.id}
              title={t.title}
            >
              {t.icon}
            </Button>
          ))}
        </div>

        <div className="topbar-speed">
          <span className="topbar-speed-label">{stepsPerSecond}/s</span>
          {/* Logarithmic 1..maxSps so the low end stays precise. */}
          <input
            type="range"
            className="slider"
            min={0}
            max={Math.log10(maxSps)}
            step={0.01}
            value={Math.log10(Math.max(1, Math.min(maxSps, stepsPerSecond)))}
            onChange={(e) =>
              dispatch(
                setStepsPerSecond(
                  Math.min(maxSps, Math.round(Math.pow(10, parseFloat(e.target.value))))
                )
              )
            }
          />
        </div>
      </div>

      <div className="topbar-right">
        <span className="topbar-fps">{fps} fps</span>
        <div className="button-group">
          <Button onClick={() => dispatch(setActiveModal("save"))} title="Save session">
            <Save size={16} />
          </Button>
          <Button onClick={() => dispatch(setActiveModal("load"))} title="Load session">
            <FolderOpen size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
