// SPDX-License-Identifier: Apache-2.0
// Source-exposed adapter refactor; the upstream history policy remains unchanged.
/** Navigation ports for the existing session store and history owner. */
import {
  createTaskNavigationHistory,
  goBack as navGoBack,
  goForward as navGoForward,
  pushAutomationsNavEntry,
  pushPluginStoreNavEntry,
  removeTaskFromHistory,
  type AutomationsNavigationTab,
  type WorkspaceNavEntry,
  type TaskNavigationHistory,
} from "@/lib/taskNavigationHistory.js";
import type { KnorviaSessionStoreState } from "./sessionStoreTypes.js";

type SetFn = (
  partial:
    | KnorviaSessionStoreState
    | Partial<KnorviaSessionStoreState>
    | ((
        state: KnorviaSessionStoreState,
      ) => KnorviaSessionStoreState | Partial<KnorviaSessionStoreState>),
) => void;
type GetFn = () => KnorviaSessionStoreState;

export function createNavigationSlice(set: SetFn, get: GetFn) {
  const updateHistory = (transform: (history: TaskNavigationHistory) => TaskNavigationHistory) => {
    set((state) => ({ taskNavHistory: transform(state.taskNavHistory) }));
  };
  const moveCursor = (move: typeof navGoBack): WorkspaceNavEntry | null => {
    const result = move(get().taskNavHistory);
    if (!result) return null;
    set({ taskNavHistory: result.history });
    return result.entry;
  };

  return {
    taskNavHistory: createTaskNavigationHistory(),
    taskNavPushAutomations: (
      workspacePath: string,
      workspaceIdentity?: string,
      automationId?: string,
      automationTab?: AutomationsNavigationTab,
    ) => {
      updateHistory((history) =>
        pushAutomationsNavEntry(
          history,
          workspacePath,
          workspaceIdentity,
          automationId,
          automationTab,
        ),
      );
    },
    taskNavPushPluginStore: (workspacePath: string, workspaceIdentity?: string) => {
      updateHistory((history) =>
        pushPluginStoreNavEntry(history, workspacePath, workspaceIdentity),
      );
    },
    taskNavGoBack: (): WorkspaceNavEntry | null => moveCursor(navGoBack),
    taskNavGoForward: (): WorkspaceNavEntry | null => moveCursor(navGoForward),
    removeTaskFromNavHistory: (taskId: string) => {
      updateHistory((history) => removeTaskFromHistory(history, taskId));
    },
  };
}
