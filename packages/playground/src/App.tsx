import { Provider } from "react-redux";
import { store, useAppSelector } from "./store";
import { EngineProvider } from "./engine/EngineProvider";
import { Canvas } from "./components/Canvas";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { Homepage } from "./components/Homepage";
import { SessionModals } from "./components/SessionModals";
import { isWebGPUAvailable } from "./utils/deviceCapabilities";
import "./App.css";

function AppContent() {
  const isHomepage = useAppSelector((s) => s.ui.isHomepage);

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
    <div className={`app ${isHomepage ? "bars-hidden" : "bars-visible"}`}>
      {!isHomepage && <TopBar />}
      <div className="app-content">
        <div className="canvas-container">
          <Canvas />
          {isHomepage && <Homepage />}
        </div>
        {!isHomepage && <Sidebar />}
      </div>
      {!isHomepage && <SessionModals />}
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
