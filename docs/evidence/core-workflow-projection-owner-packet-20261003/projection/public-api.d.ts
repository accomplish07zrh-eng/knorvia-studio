import type { DynamicWorkflowRunHealth, DynamicWorkflowRunPhaseView, DynamicWorkflowRunSubagentView, GetWorkflowRunHealth, GetWorkflowRunPhase, GetWorkflowRunSubagent } from "@knorvia/contracts";
export declare function toGetWorkflowRunPhases(phases: readonly DynamicWorkflowRunPhaseView[] | undefined): GetWorkflowRunPhase[] | undefined;
export declare function toGetWorkflowRunSubagents(subagents: readonly DynamicWorkflowRunSubagentView[]): {
    subagents: GetWorkflowRunSubagent[];
    truncated: boolean;
};
export declare function toGetWorkflowRunHealth(health: DynamicWorkflowRunHealth): GetWorkflowRunHealth;
