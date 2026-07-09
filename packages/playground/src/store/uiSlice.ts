import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { applyWormsPreset, loadConfig } from "./configSlice";

export type Tool = "paint" | "erase" | "pan";
export type ModalKind = null | "save" | "load";

export interface UiState {
  isHomepage: boolean;
  playing: boolean;
  fps: number;
  tool: Tool;
  brushSize: number;
  activeModal: ModalKind;
  /** Bumped to ask the engine to re-apply the initial state. */
  initNonce: number;
}

const initialState: UiState = {
  isHomepage: true,
  playing: false,
  fps: 0,
  tool: "paint",
  brushSize: 1,
  activeModal: null,
  initNonce: 0,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setHomepage(state, action: PayloadAction<boolean>) {
      state.isHomepage = action.payload;
    },
    setPlaying(state, action: PayloadAction<boolean>) {
      state.playing = action.payload;
    },
    setFps(state, action: PayloadAction<number>) {
      state.fps = action.payload;
    },
    setTool(state, action: PayloadAction<Tool>) {
      state.tool = action.payload;
    },
    setBrushSize(state, action: PayloadAction<number>) {
      state.brushSize = action.payload;
    },
    setActiveModal(state, action: PayloadAction<ModalKind>) {
      state.activeModal = action.payload;
    },
    requestInit(state) {
      state.initNonce++;
    },
  },
  // Presets and session loads rewrite the initial-state config wholesale, so the
  // grid has to be re-seeded even when no structural param changed.
  extraReducers: (builder) => {
    builder
      .addCase(applyWormsPreset, (state) => {
        state.initNonce++;
      })
      .addCase(loadConfig, (state) => {
        state.initNonce++;
      });
  },
});

export const {
  setHomepage,
  setPlaying,
  setFps,
  setTool,
  setBrushSize,
  setActiveModal,
  requestInit,
} = uiSlice.actions;

export default uiSlice.reducer;
