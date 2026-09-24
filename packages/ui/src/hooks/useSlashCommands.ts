/**
 * Knorvia Agent Slash Commands 便捷 hook
 *
 * 返回当前 workspace 下 Agent 广播的可用 slash commands 列表。
 */
import { useKnorviaSessionStore, selectWorkspaceKnorviaState } from "../store/sessionStore.js";

export function useSlashCommands(workspacePath: string, workspaceIdentity?: string) {
  return useKnorviaSessionStore(
    (state) => selectWorkspaceKnorviaState(state, workspacePath, workspaceIdentity).slashCommands,
  );
}
