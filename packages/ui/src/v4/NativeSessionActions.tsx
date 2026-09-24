import { useMemo } from "react";
import type { StudioKernelId } from "@knorvia/services";
import type { ConversationSnapshot } from "@knorvia/shared/protocol-v4";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { StudioSessionActions } from "@/studio/agents/StudioSessionActions.js";
import { useStudioKernelCatalog } from "@/studio/agents/useStudioKernelCatalog.js";
import { useV4Conversation } from "./V4ConversationContext.js";
import { exportNativeConversationMarkdown, nativeVisibleMessages } from "./nativeSessionHandoff.js";

/** The native owner supplies rows; Studio Runtime is used only for a confirmed external target. */
export function NativeSessionActions({
  sessionId, snapshot, workspacePath, remote, onHandoffComplete,
}: {
  sessionId: string;
  snapshot: ConversationSnapshot;
  workspacePath: string;
  remote: boolean;
  onHandoffComplete: (kernel: StudioKernelId, sessionId: string) => void;
}) {
  const studioService = useBaseWorkspaceServices().studioRuntimeService;
  const { statuses } = useStudioKernelCatalog();
  const { rowsRange } = useV4Conversation();
  const messages = useMemo(
    () => nativeVisibleMessages(snapshot.rows.window, sessionId),
    [snapshot.rows.window, sessionId],
  );
  const title = snapshot.meta.title || "Knorvia";
  if (messages.length === 0) return null;
  return (
    <StudioSessionActions
      service={studioService}
      messages={messages}
      exportTranscript={() => exportNativeConversationMarkdown(rowsRange, sessionId, snapshot, title)}
      sourceKernel="knorvia"
      workspacePath={workspacePath}
      title={title}
      statuses={statuses}
      handoffDisabled={remote}
      onHandoffComplete={onHandoffComplete}
    />
  );
}
