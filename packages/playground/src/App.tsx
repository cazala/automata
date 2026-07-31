import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Provider } from "react-redux";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { RotateCcw, X } from "lucide-react";
import { store, useAppDispatch, useAppSelector } from "./store";
import { EngineProvider, useEngine } from "./engine/EngineProvider";
import { Canvas } from "./components/Canvas";
import { Sidebar } from "./components/Sidebar";
import { Homepage } from "./components/Homepage";
import { requestInit, setHomepage } from "./store/uiSlice";
import {
  configActionsForSelection,
  parseRoutePath,
  pathForAutomaton,
  routerBasenameForLocation,
  selectionMatchesConfig,
} from "./routing";
import { isWebGPUAvailable } from "./utils/deviceCapabilities";
import "./App.css";

const HOMEPAGE_EXIT_MS = 720;
const ROUTER_BASENAME = routerBasenameForLocation(window.location.pathname);

function RouteSynchronizer() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    const route = parseRoutePath(location.pathname);
    if (route.kind === "invalid") {
      navigate("/", { replace: true });
      return;
    }

    const before = store.getState();
    if (route.kind === "home") {
      if (!before.ui.isHomepage) dispatch(setHomepage(true));
      return;
    }

    if (!selectionMatchesConfig(route.selection, before.config)) {
      for (const action of configActionsForSelection(route.selection)) {
        dispatch(action);
      }
      // Life presets can share one core implementation, so a preset-only route
      // change also needs an explicit reseed after updating its soup density.
      if (before.config.type === "life" && route.selection.type === "life") {
        dispatch(requestInit());
      }
    }
    if (before.ui.isHomepage) dispatch(setHomepage(false));
    if (location.pathname !== route.canonicalPath) {
      navigate(route.canonicalPath, { replace: true });
    }
  }, [dispatch, location.key, location.pathname, navigate]);

  return null;
}

function AppContent() {
  const isHomepage = useAppSelector((s) => s.ui.isHomepage);
  const config = useAppSelector((s) => s.config);
  const showGrowingHint = useAppSelector(
    (s) =>
      s.config.type === "neural" &&
      s.config.neural.preset === "butterfly"
  );
  const engine = useEngine();
  const navigate = useNavigate();
  const [showHomepage, setShowHomepage] = useState(isHomepage);
  const [isEnteringPlayground, setIsEnteringPlayground] = useState(false);
  const [growingHintDismissed, setGrowingHintDismissed] = useState(false);
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
    if (!showGrowingHint) setGrowingHintDismissed(false);
  }, [showGrowingHint]);

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
      navigate(pathForAutomaton(config.type, config));
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
          {!showHomepage && showGrowingHint && !growingHintDismissed && (
            <div className="growing-damage-hint" role="note">
              <span>Click or drag across the butterfly</span>
              <button
                type="button"
                className="growing-hint-close"
                onClick={() => setGrowingHintDismissed(true)}
                aria-label="Dismiss damage hint"
                title="Dismiss hint"
              >
                <X size={14} strokeWidth={2.25} />
              </button>
            </div>
          )}
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
    <BrowserRouter basename={ROUTER_BASENAME}>
      <Provider store={store}>
        <RouteSynchronizer />
        <EngineProvider>
          <AppContent />
        </EngineProvider>
      </Provider>
    </BrowserRouter>
  );
}
