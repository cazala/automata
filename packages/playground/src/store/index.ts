import { configureStore } from "@reduxjs/toolkit";
import configReducer from "./configSlice";
import uiReducer from "./uiSlice";
import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";
import {
  configActionsForSelection,
  parseRoutePath,
  routePathFromLocation,
} from "../routing";

const initialRoute = parseRoutePath(
  routePathFromLocation(window.location.pathname)
);
const initialConfig =
  initialRoute.kind === "selection"
    ? configActionsForSelection(initialRoute.selection).reduce(
        configReducer,
        configReducer(undefined, { type: "@@INIT" })
      )
    : configReducer(undefined, { type: "@@INIT" });
const initialUi = uiReducer(undefined, { type: "@@INIT" });

export const store = configureStore({
  reducer: {
    config: configReducer,
    ui: uiReducer,
  },
  preloadedState: {
    config: initialConfig,
    ui:
      initialRoute.kind === "selection"
        ? { ...initialUi, isHomepage: false }
        : initialUi,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
