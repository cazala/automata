import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { togglePokemonType } from "./configSlice";

export type Tool = "paint" | "erase" | "pan";

export interface UiState {
  isHomepage: boolean;
  playing: boolean;
  fps: number;
  tool: Tool;
  brushSize: number;
  /** Bumped to ask the engine to re-apply the initial state. */
  initNonce: number;
}

const initialState: UiState = {
  isHomepage: true,
  playing: false,
  fps: 0,
  tool: "paint",
  brushSize: 1,
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
    requestInit(state) {
      state.initNonce++;
    },
  },
  // Pokemon type toggles change the seedable pool, so the grid has to be
  // re-seeded even when no structural parameter changed.
  extraReducers: (builder) => {
    builder.addCase(togglePokemonType, (state) => {
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
  requestInit,
} = uiSlice.actions;

export default uiSlice.reducer;
