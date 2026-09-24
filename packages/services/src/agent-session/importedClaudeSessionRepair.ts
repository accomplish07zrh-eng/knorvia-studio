import type { KnorviaSessionStateSnapshot } from "@knorvia/shared";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import { repairImportedClaudeSessionSnapshot } from "#src/session/claude-native/importedClaudeHistoryRepair.js";
import type { IKnorviaAgentService } from "#src/agent/agent.js";
import type {
  KnorviaSessionReadParams,
  KnorviaSessionResumeParams,
} from "#src/agent-session/session.js";

const logger = createServiceLogger("agent-session-service");

export async function repairEmptyImportedClaudeSessionSnapshot(params: {
  agentService: IKnorviaAgentService;
  snapshot: KnorviaSessionStateSnapshot;
  target: KnorviaSessionResumeParams | KnorviaSessionReadParams;
}): Promise<KnorviaSessionStateSnapshot> {
  const repaired = await repairImportedClaudeSessionSnapshot({
    snapshot: params.snapshot,
    target: {
      workspacePath: params.target.workspacePath,
      workspaceIdentity: params.target.workspaceIdentity,
      taskId: params.target.sessionId,
      ...("mcpServers" in params.target && params.target.mcpServers
        ? { mcpServers: params.target.mcpServers }
        : {}),
    },
    createSession: (input) => params.agentService.createSession(input),
    onRepair: (history) => {
      logger.warn(
        undefined,
        `[agent-session-service] Claude 导入 session 历史异常，按 ${history.source} 回填 taskId=${params.target.sessionId}`,
      );
    },
  });
  return repaired ?? params.snapshot;
}
