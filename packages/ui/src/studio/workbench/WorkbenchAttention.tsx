import { ListTodo } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceTabState } from "@/store/tabStore.js";
import type { StudioAttentionRow } from "../attention/attentionRows.js";
import { StudioAttentionInboxView } from "../attention/StudioAttentionInboxView.js";
import { useStudioAttention } from "../attention/useStudioAttention.js";

type AttentionScope = Pick<
  WorkspaceTabState,
  "workspacePath" | "workspaceIdentity" | "remoteSessionId"
>;

/**
 * 待办并入工作台顶栏（specs/knorvia-workbench-usability-20261008.md）：
 * 顶栏只持有一份待办事实，按钮显示待处理与未读数，浮层复用原待办视图。
 */
export function useWorkbenchAttention(
  workspaceTabs: AttentionScope[],
  onOpen: (row: StudioAttentionRow) => void,
) {
  const attention = useStudioAttention(workspaceTabs, onOpen);
  const count = attention.rows.filter((row) => row.unread || row.category === "pending").length;
  return { attention, count };
}

export function WorkbenchAttentionIcon(): ReactNode {
  return <ListTodo className="size-3.5" aria-hidden="true" />;
}

export function WorkbenchAttentionPanel({
  attention,
}: {
  attention: ReturnType<typeof useWorkbenchAttention>["attention"];
}) {
  return (
    <div className="h-[min(60vh,32rem)]">
      <StudioAttentionInboxView {...attention} />
    </div>
  );
}
