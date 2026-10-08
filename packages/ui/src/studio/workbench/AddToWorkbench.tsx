import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import type { PaneWorkspaceScope } from "@/v4/paneLayoutTree.js";
import type { StudioKernelId } from "../types.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import { useTaskWorkbench } from "./workbenchStore.js";

/** 仅把已有会话引用交给布局；不创建、发送、继续或克隆任务。 */
export function AddToWorkbench({
  kernel,
  sessionId,
  scope,
  onOpen,
}: {
  kernel: StudioKernelId;
  sessionId: string | null;
  scope: PaneWorkspaceScope;
  onOpen(): void;
}) {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const runtime = useStudioRuntime();
  const [error, setError] = useState(false);
  const conversation = runtime.overview?.conversations.find(
    (item) => item.id === sessionId && item.kernel === kernel,
  );
  const target =
    kernel === "knorvia"
      ? scope
      : conversation
        ? { workspacePath: conversation.workspacePath }
        : null;
  if (!sessionId || !target) return null;
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border px-3 py-1 text-ui-xs">
      {error && (
        <span role="alert">
          {zh
            ? "工作台已有四格，请先收起一格；任务和草稿会保留。"
            : "The workbench has four tiles. Shelve one first; tasks and drafts are kept."}
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-ui-xs"
        data-testid="add-to-task-workbench"
        onClick={() => {
          const store = useTaskWorkbench.getState();
          store.initialize(target);
          if (
            !store.add({
              id: crypto.randomUUID(),
              kernel,
              sessionId,
              scope: target,
              opened: true,
              existing: true,
            })
          ) {
            setError(true);
            return;
          }
          setError(false);
          onOpen();
        }}
      >
        {zh ? "加入工作台" : "Add to workbench"}
      </Button>
    </div>
  );
}
