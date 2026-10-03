import { create } from "zustand";
import { isRendererReloadNavigation } from "@/lib/rendererNavigation.js";
import { persistPaneLayout, readPersistedPaneLayout } from "@/v4/paneLayoutPersistence.js";
import {
  applyPaneLayoutCommand,
  effectiveFocusedPaneId,
  findPaneIdForSession,
  INITIAL_PANE_LAYOUT,
  type PaneBinding,
  type PaneLayoutCommand,
  type PaneLayoutSnapshot,
  type PaneSplitSide,
  type PaneWorkspaceScope,
  type SplitDirection,
} from "@/v4/paneLayoutTree.js";

const persistedAtLoad = readPersistedPaneLayout();
const initial = isRendererReloadNavigation() ? persistedAtLoad : null;
export function hadPersistedPaneLayoutAtModuleLoad(): boolean {
  return persistedAtLoad !== null;
}
export * from "@/v4/paneLayoutTree.js";
export * from "@/v4/paneLayoutPersistence.js";

interface PaneLayoutStore extends PaneLayoutSnapshot {
  splitPane: (anchorPaneId: string, direction: SplitDirection, scope: PaneWorkspaceScope) => void;
  splitPaneWithBinding: (anchorPaneId: string, side: PaneSplitSide, binding: PaneBinding) => void;
  openSessionInNewPane: (scope: PaneWorkspaceScope, sessionId: string) => void;
  replacePaneBinding: (paneId: string, binding: PaneBinding) => void;
  closePane: (paneId: string) => void;
  focusPane: (paneId: string) => void;
  bindPaneSession: (paneId: string, sessionId: string) => void;
  setSplitRatio: (splitId: string, ratio: number) => void;
  confirmRestoredPaneSession: (paneId: string) => void;
  resetToPrimaryPane: () => void;
}

export const usePaneLayoutStore = create<PaneLayoutStore>()((set) => {
  const dispatch = (command: PaneLayoutCommand) =>
    set((state) => applyPaneLayoutCommand(state, command));
  const split = (anchor: string, side: PaneSplitSide, binding: PaneBinding): PaneLayoutCommand => ({
    kind: "split",
    anchor,
    binding,
    before: side === "left" || side === "up",
    direction: side === "left" || side === "right" ? "row" : "column",
  });
  return {
    ...(initial ?? INITIAL_PANE_LAYOUT),
    splitPane(anchor, direction, workspaceScope) {
      dispatch({
        kind: "split",
        anchor,
        direction,
        before: false,
        binding: { workspaceScope, sessionId: null },
      });
    },
    splitPaneWithBinding(anchor, side, binding) {
      dispatch(split(anchor, side, binding));
    },
    openSessionInNewPane(workspaceScope, sessionId) {
      set((state) => {
        const existing = findPaneIdForSession(state, workspaceScope, sessionId);
        return applyPaneLayoutCommand(
          state,
          existing !== null
            ? { kind: "focus", paneId: existing }
            : split(effectiveFocusedPaneId(state), "right", { workspaceScope, sessionId }),
        );
      });
    },
    replacePaneBinding(paneId, binding) {
      dispatch({ kind: "replace", paneId, binding });
    },
    closePane(paneId) {
      dispatch({ kind: "close", paneId });
    },
    focusPane(paneId) {
      dispatch({ kind: "focus", paneId });
    },
    bindPaneSession(paneId, sessionId) {
      dispatch({ kind: "bind", paneId, sessionId });
    },
    setSplitRatio(splitId, ratio) {
      dispatch({ kind: "ratio", splitId, ratio });
    },
    confirmRestoredPaneSession(paneId) {
      dispatch({ kind: "confirm", paneId });
    },
    resetToPrimaryPane() {
      set(INITIAL_PANE_LAYOUT);
    },
  };
});

usePaneLayoutStore.subscribe(persistPaneLayout);
