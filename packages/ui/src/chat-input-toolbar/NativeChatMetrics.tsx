import type { ConversationSnapshot } from "@knorvia/shared/protocol-v4";
import { useSessionDebug } from "@/hooks/useSessionDebug.js";
import { ChatMetricsBar } from "./ChatMetricsBar.js";
import { nativeChatMetrics } from "./chatMetrics.js";

export function NativeChatMetrics({
  snapshot,
  workspacePath,
  workspaceIdentity,
}: {
  snapshot: ConversationSnapshot;
  workspacePath: string;
  workspaceIdentity?: string;
}) {
  const usage = snapshot.usage.cumulative;
  const debug = useSessionDebug({
    workspacePath,
    workspaceIdentity,
    taskId: snapshot.sessionId,
    poll: false,
    refreshKey: `${snapshot.control.phase}:${usage.inputTokens}:${usage.outputTokens}:${usage.cacheReadTokens}`,
  });
  return <ChatMetricsBar metrics={nativeChatMetrics(snapshot, debug)} />;
}
