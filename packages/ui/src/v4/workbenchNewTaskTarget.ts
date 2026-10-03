import {
  effectiveFocusedPaneId,
  V4_PRIMARY_PANE_ID,
  type PaneLayoutSnapshot,
  type PaneWorkspaceScope,
} from "@/v4/paneLayoutStore.js";
import { selectWorkbenchGroupPaneBinding, type WorkbenchGroup } from "@/v4/workbenchGroupStore.js";

export interface WorkbenchNewTaskTarget {
  workspacePath: string;
  workspaceIdentity?: string;
}

export function resolveWorkbenchNewTaskTarget(input: {
  activeWorkspacePath: string | null;
  activeWorkspaceIdentity?: string | null;
  activeGroup: WorkbenchGroup | null;
  paneLayout: PaneLayoutSnapshot;
}): WorkbenchNewTaskTarget | null {
  const candidates: Array<() => PaneWorkspaceScope | null> = [
    () =>
      input.activeGroup
        ? (selectWorkbenchGroupPaneBinding(input.activeGroup, input.activeGroup.focusedPaneId)
            ?.workspaceScope ?? null)
        : null,
    () => {
      const id = effectiveFocusedPaneId(input.paneLayout);
      return id === V4_PRIMARY_PANE_ID
        ? null
        : (input.paneLayout.panes[id]?.workspaceScope ?? null);
    },
    () =>
      input.activeWorkspacePath
        ? {
            workspacePath: input.activeWorkspacePath,
            workspaceIdentity: input.activeWorkspaceIdentity ?? undefined,
          }
        : null,
  ];
  for (const read of candidates) {
    const scope = read();
    if (scope)
      return {
        workspacePath: scope.workspacePath,
        ...(scope.workspaceIdentity?.trim() ? { workspaceIdentity: scope.workspaceIdentity } : {}),
      };
  }
  return null;
}
