import "./Homepage.css";

export function Homepage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="homepage">
      <div className="homepage-card">
        <h1 className="homepage-title">Automata</h1>
        <p className="homepage-subtitle">
          A library for building cellular automata simulations with WebGPU —
          neural CA, reaction-diffusion, Lenia, and the classics, all running
          on the GPU in real time.
        </p>
        <div className="homepage-actions">
          <button className="homepage-button" onClick={onEnter}>
            Play
          </button>
          <a
            className="homepage-button ghost"
            href={`${import.meta.env.BASE_URL}docs/`}
          >
            Learn
          </a>
        </div>
      </div>
    </div>
  );
}
