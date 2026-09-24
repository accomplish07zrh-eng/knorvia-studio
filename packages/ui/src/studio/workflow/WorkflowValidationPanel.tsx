import { CircleCheck } from "lucide-react";
import type { StudioWorkflow, StudioWorkflowNode, WorkflowIssue } from "./types.js";
import { useWorkflowText } from "./useWorkflowText.js";

export function WorkflowValidationPanel({
  workflow,
  issues,
  onSelect,
}: {
  workflow: StudioWorkflow;
  issues: WorkflowIssue[];
  onSelect: (node: StudioWorkflowNode) => void;
}) {
  const t = useWorkflowText();
  return (
    <div className="p-4">
      <p className="mb-3 flex items-center gap-2 text-ui-base font-medium">
        {!issues.length && <CircleCheck className="size-4 text-success" />}
        {t(issues.length ? "issues" : "valid", { count: issues.length })}
      </p>
      {!issues.length && (
        <p className="text-ui-sm text-foreground-subtle">{t("validDescription")}</p>
      )}
      <div className="space-y-2">
        {issues.map((issue, index) => {
          const node = workflow.nodes.find((item) => item.id === issue.nodeId);
          return (
            <button
              type="button"
              key={`${issue.code}:${issue.nodeId ?? issue.edgeId ?? index}`}
              className="block w-full rounded-lg bg-surface px-3 py-2 text-left hover:bg-hover"
              disabled={!node}
              onClick={() => {
                if (node) onSelect(node);
              }}
            >
              {node && (
                <span className="mb-1 block break-words text-ui-sm font-medium">
                  {node.data.label || t(`kind.${node.data.kind}`)}
                </span>
              )}
              <span className="text-ui-sm text-foreground-subtle">{t(`issue.${issue.code}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
