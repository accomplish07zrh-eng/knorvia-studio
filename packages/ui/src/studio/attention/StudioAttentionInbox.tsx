import { StudioAttentionInboxView } from "./StudioAttentionInboxView.js";
import type { WorkspaceTabState } from "@/store/tabStore.js";
import type { StudioAttentionRow } from "./attentionRows.js";
import { useStudioAttention } from "./useStudioAttention.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";

export function StudioAttentionInbox({
  workspaceTabs,
  onOpen,
}: {
  workspaceTabs: Pick<
    WorkspaceTabState,
    "workspacePath" | "workspaceIdentity" | "remoteSessionId"
  >[];
  onOpen: (row: StudioAttentionRow) => void;
}) {
  const runtime = useStudioRuntime();
  return (
    <ConnectedStudioAttentionInbox
      key={runtime.connectionKey}
      workspaceTabs={workspaceTabs}
      onOpen={onOpen}
    />
  );
}

function ConnectedStudioAttentionInbox({
  workspaceTabs,
  onOpen,
}: {
  workspaceTabs: Pick<
    WorkspaceTabState,
    "workspacePath" | "workspaceIdentity" | "remoteSessionId"
  >[];
  onOpen: (row: StudioAttentionRow) => void;
}) {
  return <StudioAttentionInboxView {...useStudioAttention(workspaceTabs, onOpen)} />;
}
