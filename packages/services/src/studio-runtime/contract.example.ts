import type { StudioCommand } from "./contract.js";
import {
  studioConditionReferences,
  validateStudioWorkflow,
  type StudioWorkflowDefinition,
} from "./contract.js";

export const newIndependentConversation: StudioCommand = {
  commandId: "create-example-1",
  type: "create-conversation",
  id: "conversation-example-1",
  kernel: "codex",
  workspacePath: "D:/projects/example",
};

/** An editor uses the same pure validation as the executor, without Node adapters. */
export function inspectWorkflowDraft(draft: StudioWorkflowDefinition) {
  return {
    issues: validateStudioWorkflow(draft),
    exampleReferences: studioConditionReferences("{{review}}.approved == true"),
  };
}
