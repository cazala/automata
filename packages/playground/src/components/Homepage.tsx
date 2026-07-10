import { ArrowRight } from "lucide-react";
import { useAppDispatch } from "../store";
import { setHomepage } from "../store/uiSlice";
import "./Homepage.css";

export function Homepage() {
  const dispatch = useAppDispatch();

  return (
    <div className="homepage">
      <div className="homepage-card">
        <h1 className="homepage-title">Automata</h1>
        <p className="homepage-subtitle">
          A WebGPU playground for cellular automata — elementary, life-like, and
          neural. Configure the rules and paint on the grid in real time.
        </p>
        <button className="homepage-button" onClick={() => dispatch(setHomepage(false))}>
          Enter playground <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
