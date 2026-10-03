// Public dependency surfaces only. Implementations are existing collaborators.
import type {
    WorkflowGraphSeed,
    WorkflowNodePromptUpdate,
    WorkflowRunSnapshot,
    WorkflowSessionLink,
    WorkflowDefinition,
} from "@knorvia/contracts";

export declare function deriveWorkflowSessionLinks(
    snapshot: Pick<WorkflowRunSnapshot, "activities" | "runId">,
): WorkflowSessionLink[];

export declare const WorkflowGraphSeedSchema: { parse(value: unknown): WorkflowGraphSeed };
export declare const WorkflowNodePromptUpdateSetSchema: {
    parse(value: unknown): { nodes: WorkflowNodePromptUpdate[]; reasoning?: string };
};
export declare const WorkflowDefinitionSchema: { parse(value: unknown): WorkflowDefinition };

// Call the actual public @knorvia/contracts exports in installed source.
// No schema implementation or session-link derivation body is included/authorized here.
