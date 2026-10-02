// Import real types/functions using these paths; no executable implementation supplied.
// node:crypto
export declare function randomUUID(): string;
// @knorvia/contracts: types used in api.d.ts, runtime schema and link derivation.
import type {
  ExpertWorkflowRunSnapshot,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowNodeStatus,
  WorkflowActivitySnapshot,
  WorkflowPhaseDefinition,
} from "@knorvia/contracts";
export declare const WorkflowDefinitionSchema: { parse(input: unknown): WorkflowDefinition };
export declare function deriveWorkflowSessionLinks(input: {
  activities: WorkflowActivitySnapshot[];
  runId: string;
}): ExpertWorkflowRunSnapshot["sessionLinks"];
// ../definition.js
export declare function createExpertWorkflowDefinition(): WorkflowDefinition;
export declare function workflowDefinitionPhaseMap(
  definition: WorkflowDefinition,
): Map<string, WorkflowPhaseDefinition>;
// ./ids.js
export declare function phaseNodeId(phase: string): string;
export declare function safeRunIdSegment(value: string): string;
// ./prompts.js
export declare function createPhaseGraph(definition: WorkflowDefinition): WorkflowGraph;
export declare function updateGraphNodeStatus(
  graph: WorkflowGraph,
  phase: string,
  status: WorkflowNodeStatus | undefined,
): WorkflowGraph;
// ../lifecycle.js: types WorkflowGraphNodeChange, WorkflowSnapshotLifecycleResult.
// ./types.js: types ExpertWorkflowRuntimeDeps and ExpertWorkflowLookupOptions.
// Runtime deps expose definition?, agentRunner, createActivityId?, createRunId?, now?,
// onWorkflowEvent?, store. Lookup options expose runId?, cwd:string, abortSignal?.
// store: readRun(runId,{signal}), readLatestRun({cwd,kind},{signal}),
// appendGraphRecord(runId,record,{signal}), appendEvent(event,{signal}); all Promise results.
// Other public store/runner type members are retained through production indexed types.
