import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bot,
  CircleCheck,
  CirclePlay,
  GitBranch,
  GitFork,
  GitMerge,
  Hand,
  Images,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../components/lib/utils.js";
import { studioKernelOption } from "../types.js";
import { useStudioKernelCatalog } from "../agents/useStudioKernelCatalog.js";
import type { StudioWorkflowNode, WorkflowNodeKind } from "./types.js";
import { useWorkflowText } from "./useWorkflowText.js";

export const WORKFLOW_NODE_ICONS: Record<WorkflowNodeKind, LucideIcon> = {
  start: CirclePlay,
  agent: Bot,
  creation: Images,
  condition: GitBranch,
  parallel: GitFork,
  join: GitMerge,
  approval: Hand,
  end: CircleCheck,
};

export const WorkflowNode = memo(function WorkflowNode({
  data,
  selected,
  isConnectable,
}: NodeProps<StudioWorkflowNode>) {
  const t = useWorkflowText();
  const { statuses } = useStudioKernelCatalog();
  const Icon = WORKFLOW_NODE_ICONS[data.kind];
  const detail =
    data.kind === "agent"
      ? studioKernelOption(data.kernel, statuses).name
      : data.kind === "creation"
        ? t(data.creationModelId ? "creationReady" : "creationModelRequired")
      : data.kind === "join"
        ? t(data.joinPolicy === "all" ? "waitAll" : "waitAny")
        : t(`kind.${data.kind}`);
  return (
    <div
      className={cn(
        "w-52 rounded-xl border bg-card px-3 py-3 text-foreground shadow-xs",
        data.kind === "condition" && "pr-7",
        selected ? "border-foreground-subtle ring-1 ring-foreground-subtle" : "border-card-border",
        data.executionState === "succeeded" && "border-success/60",
        data.executionState === "failed" && "border-destructive/60",
        data.executionState === "running" && "ring-1 ring-input-border-focused",
      )}
    >
      {data.kind !== "start" && (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          className="studio-workflow-handle"
        />
      )}
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
        <span className="truncate text-ui-base font-medium">
          {data.label || t(`kind.${data.kind}`)}
        </span>
      </div>
      <div className="mt-1.5 truncate pl-6.5 text-ui-sm text-foreground-subtle">{detail}</div>
      {data.executionState && (
        <div className="mt-2 pl-6.5 text-ui-xs text-foreground-subtle" role="status">
          {t(`state.${data.executionState}`)}
        </div>
      )}
      {data.kind === "condition" ? (
        <>
          <span className="absolute top-1/4 right-3 -translate-y-1/2 text-ui-xs text-foreground-subtle">
            {t("yes")}
          </span>
          <Handle
            id="yes"
            type="source"
            position={Position.Right}
            style={{ top: "25%" }}
            className="studio-workflow-handle"
            isConnectable={isConnectable}
          />
          <span className="absolute top-3/4 right-3 -translate-y-1/2 text-ui-xs text-foreground-subtle">
            {t("no")}
          </span>
          <Handle
            id="no"
            type="source"
            position={Position.Right}
            style={{ top: "75%" }}
            className="studio-workflow-handle"
            isConnectable={isConnectable}
          />
        </>
      ) : (
        data.kind !== "end" && (
          <Handle
            type="source"
            position={Position.Right}
            isConnectable={isConnectable}
            className="studio-workflow-handle"
          />
        )
      )}
    </div>
  );
});
