import { useEffect, useRef, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../store";
import { setActiveModal } from "../store/uiSlice";
import { loadConfig } from "../store/configSlice";
import { useEngine } from "../engine/EngineProvider";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import {
  deleteSession,
  downloadSession,
  listSessions,
  loadSession,
  readSessionFile,
  saveSession,
  type SessionSummary,
} from "../utils/sessions";

export function SessionModals() {
  const dispatch = useAppDispatch();
  const engine = useEngine();
  const activeModal = useAppSelector((s) => s.ui.activeModal);
  const config = useAppSelector((s) => s.config);

  const [name, setName] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  // Pause while a modal is open.
  useEffect(() => {
    if (activeModal) engine.pause();
  }, [activeModal, engine]);

  useEffect(() => {
    if (activeModal === "load") setSessions(listSessions());
    if (activeModal === "save") setName(`session ${new Date().toLocaleString()}`);
  }, [activeModal]);

  const close = () => dispatch(setActiveModal(null));

  const handleSave = () => {
    if (!name.trim()) return;
    saveSession(name.trim(), config);
    close();
  };

  const applySession = (id: string) => {
    const data = loadSession(id);
    if (data) {
      dispatch(loadConfig(data.config));
      // Re-apply the initial state for the loaded config after engine syncs.
      setTimeout(() => engine.reset(), 0);
    }
    close();
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await readSessionFile(file);
      dispatch(loadConfig(data.config));
      setTimeout(() => engine.reset(), 0);
      close();
    } catch (e) {
      alert(`Could not import session: ${(e as Error).message}`);
    }
  };

  if (activeModal === "save") {
    return (
      <Modal title="Save session" onClose={close}>
        <input
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Session name"
          autoFocus
        />
        <div className="modal-actions">
          <Button onClick={() => downloadSession(saveSession(name.trim() || "session", config))}>
            <Download size={15} /> Export JSON
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
        </div>
      </Modal>
    );
  }

  if (activeModal === "load") {
    return (
      <Modal title="Load session" onClose={close}>
        <div className="session-list">
          {sessions.length === 0 && (
            <div className="session-empty">No saved sessions yet.</div>
          )}
          {sessions.map((s) => (
            <div key={s.id} className="session-item">
              <div className="session-item-info">
                <span className="session-item-name">{s.name}</span>
                <span className="session-item-date">
                  {new Date(s.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="session-item-actions">
                <Button onClick={() => applySession(s.id)}>Load</Button>
                <Button
                  variant="danger"
                  title="Delete"
                  onClick={() => {
                    deleteSession(s.id);
                    setSessions(listSessions());
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => handleImport(e.target.files?.[0])}
          />
          <Button onClick={() => fileInput.current?.click()}>
            <Upload size={15} /> Import JSON
          </Button>
        </div>
      </Modal>
    );
  }

  return null;
}
