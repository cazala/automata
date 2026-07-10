import { useEffect, useRef, useState } from "react";
import { Provider } from "react-redux";
import { RotateCcw } from "lucide-react";
import { store, useAppDispatch, useAppSelector } from "./store";
import { EngineProvider, useEngine } from "./engine/EngineProvider";
import { Canvas } from "./components/Canvas";
import { Sidebar } from "./components/Sidebar";
import { Homepage } from "./components/Homepage";
import { setHomepage } from "./store/uiSlice";
import { isWebGPUAvailable } from "./utils/deviceCapabilities";
import "./App.css";

const HOMEPAGE_EXIT_MS = 720;

function AppContent() {
  const dispatch = useAppDispatch();
  const isHomepage = useAppSelector((s) => s.ui.isHomepage);
  const engine = useEngine();
  const [showHomepage, setShowHomepage] = useState(isHomepage);
  const [isEnteringPlayground, setIsEnteringPlayground] = useState(false);
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => {
    if (isHomepage) {
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
      }
      setShowHomepage(true);
      setIsEnteringPlayground(false);
    }
  }, [isHomepage]);

  useEffect(() => {
    return () => {
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current);
      }
    };
  }, []);

  const enterPlayground = () => {
    if (!isHomepage || isEnteringPlayground) return;
    setShowHomepage(true);
    setIsEnteringPlayground(true);
    transitionTimer.current = window.setTimeout(() => {
      dispatch(setHomepage(false));
      setShowHomepage(false);
      setIsEnteringPlayground(false);
      transitionTimer.current = null;
    }, HOMEPAGE_EXIT_MS);
  };

  const showPlaygroundChrome = !isHomepage || isEnteringPlayground;

  if (!isWebGPUAvailable()) {
    return (
      <div className="webgpu-unavailable">
        <h1>WebGPU is not available</h1>
        <p>
          This playground requires a WebGPU-capable browser (recent Chrome, Edge,
          or Safari). Please try again in a supported browser.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`app ${showHomepage ? "homepage-visible" : "playground-visible"} ${
        isEnteringPlayground ? "entering-playground" : ""
      }`}
    >
      <div className="app-content">
        <div className="canvas-container">
          <Canvas />
          {!showHomepage && (
            <button
              className="mobile-reset-button"
              onClick={() => engine.reset()}
              title="Reset simulation"
              aria-label="Reset simulation"
            >
              <RotateCcw size={19} />
            </button>
          )}
          {showHomepage && <Homepage onEnter={enterPlayground} />}
        </div>
        {showPlaygroundChrome && <Sidebar />}
      </div>
    </div>
  );
}

export function App() {
  return (
    <Provider store={store}>
      <EngineProvider>
        <AppContent />
      </EngineProvider>
    </Provider>
  );
}
