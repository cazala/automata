import { useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useAppDispatch } from "../store";
import { setHomepage } from "../store/uiSlice";
import { isMobileDevice } from "../utils/deviceCapabilities";
import "./Homepage.css";

export function Homepage() {
  const dispatch = useAppDispatch();
  const [showWarning, setShowWarning] = useState(false);
  const isMobile = isMobileDevice();

  const handlePlay = () => {
    if (isMobile) {
      setShowWarning(true);
    } else {
      dispatch(setHomepage(false));
    }
  };

  if (showWarning) {
    return (
      <div className="homepage">
        <div className="homepage-card">
          <AlertTriangle size={40} className="homepage-warning-icon" />
          <h1 className="homepage-title">Desktop only</h1>
          <p className="homepage-subtitle">
            The playground needs WebGPU and a pointer, so it isn't available on
            mobile. Please open it on a desktop browser.
          </p>
          <button className="homepage-button ghost" onClick={() => setShowWarning(false)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="homepage">
      <div className="homepage-card">
        <h1 className="homepage-title">Automata</h1>
        <p className="homepage-subtitle">
          A WebGPU playground for cellular automata — elementary, life-like, and
          neural. Configure the rules and paint on the grid in real time.
        </p>
        <button className="homepage-button" onClick={handlePlay}>
          Enter playground <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
