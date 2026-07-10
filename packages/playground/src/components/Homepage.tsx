import { ArrowRight } from "lucide-react";
import "./Homepage.css";

export function Homepage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="homepage">
      <div className="homepage-card">
        <h1 className="homepage-title">Automata</h1>
        <p className="homepage-subtitle">
          A WebGPU playground for cellular automata — elementary, life-like, and
          neural. Configure the rules and paint on the grid in real time.
        </p>
        <button className="homepage-button" onClick={onEnter}>
          Enter playground <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
