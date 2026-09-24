import { useCallback, useMemo, useReducer } from "react";
import type { WorkspaceMainView } from "@/app-shell/types.js";
import type { StudioKernelId } from "@/studio/types.js";

export interface StudioRoute {
  view: WorkspaceMainView;
  kernelId: StudioKernelId;
  externalSessionId: string;
  groupId: string | null;
  chatMode: "single" | "groups";
}

interface NavigationState {
  entries: StudioRoute[];
  index: number;
  createGroupRequest: number;
  createGroupVersion: number;
}

type Action =
  | { type: "navigate"; patch: Partial<StudioRoute>; reset?: boolean }
  | { type: "back" }
  | { type: "forward" }
  | { type: "create-group" }
  | { type: "consume-create-group" };

const initialRoute: StudioRoute = {
  view: "chat",
  kernelId: "knorvia",
  externalSessionId: "",
  groupId: null,
  chatMode: "single",
};

export function studioNavigationReducer(state: NavigationState, action: Action): NavigationState {
  if (action.type === "consume-create-group") return { ...state, createGroupRequest: 0 };
  if (action.type === "back") return { ...state, index: Math.max(0, state.index - 1) };
  if (action.type === "forward") {
    return { ...state, index: Math.min(state.entries.length - 1, state.index + 1) };
  }
  const current = state.entries[state.index] ?? initialRoute;
  const next = {
    ...current,
    ...(action.type === "create-group"
      ? { view: "groups" as const, chatMode: "groups" as const }
      : action.patch),
  };
  const createGroupVersion = state.createGroupVersion + (action.type === "create-group" ? 1 : 0);
  const createGroupRequest =
    action.type === "create-group" ? createGroupVersion : state.createGroupRequest;
  if (action.type === "navigate" && action.reset)
    return { entries: [next], index: 0, createGroupRequest, createGroupVersion };
  if (
    Object.keys(next).every(
      (key) => next[key as keyof StudioRoute] === current[key as keyof StudioRoute],
    )
  ) {
    return { ...state, createGroupRequest, createGroupVersion };
  }
  const entries = [...state.entries.slice(0, state.index + 1), next].slice(-40);
  return { entries, index: entries.length - 1, createGroupRequest, createGroupVersion };
}

/** Shell history owns only frontend locations; native task history stays with the session store. */
export function useStudioNavigation() {
  const [state, dispatch] = useReducer(studioNavigationReducer, {
    entries: [initialRoute],
    index: 0,
    createGroupRequest: 0,
    createGroupVersion: 0,
  });
  const route = state.entries[state.index] ?? initialRoute;
  const navigate = useCallback((patch: Partial<StudioRoute>, reset = false) => {
    dispatch({ type: "navigate", patch, reset });
  }, []);
  const showTask = useCallback(
    () => navigate({ view: "chat", kernelId: "knorvia", chatMode: "single" }, true),
    [navigate],
  );
  const selectKernel = useCallback(
    (kernelId: StudioKernelId) =>
      navigate({
        kernelId,
        chatMode: "single",
        view: kernelId === "knorvia" ? "chat" : "external-chat",
        externalSessionId: kernelId === "knorvia" ? "" : crypto.randomUUID(),
      }),
    [navigate],
  );
  const selectGroup = useCallback(
    (groupId: string | null) => navigate({ view: "groups", chatMode: "groups", groupId }),
    [navigate],
  );
  const createGroup = useCallback(() => dispatch({ type: "create-group" }), []);
  const consumeCreateGroup = useCallback(() => dispatch({ type: "consume-create-group" }), []);
  const back = useCallback(() => dispatch({ type: "back" }), []);
  const forward = useCallback(() => dispatch({ type: "forward" }), []);
  return useMemo(
    () => ({
      route,
      navigate,
      showTask,
      selectKernel,
      selectGroup,
      createGroup,
      consumeCreateGroup,
      createGroupRequest: state.createGroupRequest,
      canGoBack: state.index > 0,
      canGoForward: state.index < state.entries.length - 1,
      back,
      forward,
    }),
    [
      route,
      navigate,
      showTask,
      selectKernel,
      selectGroup,
      createGroup,
      consumeCreateGroup,
      state.createGroupRequest,
      state.index,
      state.entries.length,
      back,
      forward,
    ],
  );
}

export type StudioNavigation = ReturnType<typeof useStudioNavigation>;
