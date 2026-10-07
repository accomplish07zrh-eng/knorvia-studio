import type { StudioCommand } from "./contract.js";
import type { StudioAgentTools } from "./contract.js";
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

/** Host supplies a caller-bound port; tool input cannot choose ownership or approve actions. */
export function dispatchConfiguredStudioChild(tools: StudioAgentTools) {
  return tools.call("dispatch_task", {
    commandId: "dispatch-example-1",
    kernel: "codex",
    task: "Review the parser",
    context: "Inspect parser tests in the isolated project",
    permission: "read-only",
  });
}
