import type { StudioRun } from "@knorvia/services";
import { StudioRunHistory } from "../runtime/StudioRunHistory.js";
import { StudioTimeline } from "../runtime/StudioTimeline.js";
import { StudioInteractions } from "../runtime/StudioInteractions.js";
import { WorkflowRunComparison } from "./WorkflowRunComparison.js";

export function WorkflowHistoryPane({
  workflowId,
  runs,
}: {
  workflowId: string;
  runs: StudioRun[];
}) {
  return (
    <div className="space-y-3">
      <WorkflowRunComparison runs={runs} />
      <div className="px-2 pt-2">
        <StudioInteractions targetId={workflowId} />
      </div>
      <StudioRunHistory targetId={workflowId} />
      <div className="flex min-h-0 max-h-[60vh] flex-col">
        <StudioTimeline targetId={workflowId} showHistory={false} showInteractions={false} />
      </div>
    </div>
  );
}
