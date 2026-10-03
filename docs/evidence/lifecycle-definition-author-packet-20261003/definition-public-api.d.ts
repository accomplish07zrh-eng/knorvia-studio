import { type WorkflowDefinition, type WorkflowStrategy } from "@knorvia/contracts";
export declare const BUILT_IN_EXPERT_WORKFLOW_KIND = "expert";
export declare const BUILT_IN_EXPERT_WORKFLOW_DEFINITION_ID = "expert";
export declare const BUILT_IN_EXPERT_WORKFLOW_DEFINITION_VERSION = "2";
export declare const DEFAULT_EXPERT_WORKFLOW_STRATEGY: WorkflowStrategy;
export declare function createExpertWorkflowDefinition(): WorkflowDefinition;
export declare function workflowDefinitionPhaseMap(definition: WorkflowDefinition): Map<string, WorkflowDefinition["phases"][number]>;
