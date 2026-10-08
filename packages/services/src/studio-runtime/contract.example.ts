import type { StudioCommand } from "./contract.js";
import type { StudioReviewDraft } from "./contract.js";
import type {
  StudioWorkspaceApplyRequest,
  StudioWorkspaceChangesRequest,
  StudioWorkspaceImageRequest,
} from "./contract.js";
import type { StudioKernelInteraction, StudioKernelEvent } from "./contract.js";

/** 描述是展示信息；答案仍是原生 label，旧 string 选项无需迁移。 */
export const describedQuestion: StudioKernelInteraction = {
  id: "native-question",
  kind: "question",
  title: "Choose a scope",
  questions: [
    {
      id: "scope",
      title: "Scope",
      options: ["Legacy", { label: "Project", description: "Only the current project" }],
    },
  ],
};
export const unknownNativeTool: StudioKernelEvent = {
  type: "tool",
  id: "tool",
  name: "Read",
  state: "unknown",
  statusDetail: "vendor_pending",
  input: '{"path":"example.txt"}',
  output: "",
  content: '[{"type":"content","content":{"type":"text","text":"Pending"}}]',
};

/** This acknowledges the displayed event only; it cannot answer an approval. */
export const markDisplayedAttentionRead: StudioCommand = {
  commandId: "attention-read-example-1",
  type: "attention-read",
  object: "run",
  id: "run-example-1",
  version: '[1,"run-example-1",1,"succeeded",123,true]',
};

/** Call only after showing the full prepared summary and receiving user confirmation. */
export function confirmPreparedWorkspaceReview(draft: StudioReviewDraft): StudioCommand {
  if (!draft.preview) throw new Error("Prepare and review the summary before confirming");
  return {
    commandId: draft.preview.commandId,
    type: "workspace-review",
    action: "send",
    runId: draft.runId,
    stepId: draft.stepId,
    draftId: draft.id,
    baseRevision: draft.revision,
    previewId: draft.preview.id,
  };
}

/** Use the displayed Host versions for both preview and the user's later apply action. */
export function reviewedSnapshotImageRequests(
  runId: string,
  stepId: string,
  reviewed: StudioWorkspaceImageRequest,
): { preview: StudioWorkspaceChangesRequest; apply: StudioWorkspaceApplyRequest } {
  return {
    preview: { runId, stepId, imagePreview: reviewed },
    apply: { runId, stepId, paths: [reviewed.path], reviewedVersions: [reviewed] },
  };
}
import type { StudioWorkspaceRuntimeRequest } from "./contract.js";
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

/** The user reviews cwd and argv before submitting this one-time approval. */
export const startPreparedWorkspace: StudioWorkspaceRuntimeRequest = {
  runId: "run-example-1",
  stepId: "step-example-1",
  control: {
    action: "start",
    approved: true,
    command: { executable: "node", args: ["server.js", "--host", "{host}", "--port", "{port}"] },
  },
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
