import { z } from "zod";
import type { StudioAgentPolicy, StudioAgentTaskState } from "../agentToolTypes.js";
import type { StudioRun } from "../types.js";
import type { StudioWorkspaceChange } from "../types.js";
import type { StudioAgentArtifactRef } from "../agentToolTypes.js";

export const DEFAULT_STUDIO_AGENT_POLICY: Readonly<StudioAgentPolicy> = {
  maxActive: 4,
  maxTasks: 16,
  maxDepth: 2,
  maxRounds: 8,
  maxAttempts: 3,
  timeoutMs: 15 * 60 * 1000,
  deliveryAttempts: 10,
  retryMs: 1000,
};
export function studioAgentPolicy(input?: Partial<StudioAgentPolicy>): StudioAgentPolicy {
  const policy = { ...DEFAULT_STUDIO_AGENT_POLICY, ...input };
  for (const value of Object.values(policy))
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("无效的 Agent 资源上限");
  return policy;
}
export function studioAgentState(run: StudioRun): StudioAgentTaskState {
  if (
    run.cancelRequested &&
    (run.resultKnown !== true || ["running", "waiting"].includes(run.state))
  )
    return "cancel-unconfirmed";
  switch (run.state) {
    case "queued":
      return "accepted";
    case "running":
      return "running";
    case "waiting":
    case "interrupted":
      return "needs-input";
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}
const id = z.string().regex(/^[\w:-]{1,180}$/);
export function studioAgentTaskState(runs: StudioRun[], current: StudioRun): StudioAgentTaskState {
  const states = runs.map(studioAgentState);
  for (const state of ["cancel-unconfirmed", "needs-input", "running", "accepted"] as const)
    if (states.includes(state)) return state;
  return studioAgentState(current);
}
export function studioAgentArtifactReferences(
  changes: StudioWorkspaceChange[],
  runId: string,
  stepId: string,
): StudioAgentArtifactRef[] {
  return changes.map(({ path, kind }) => ({ runId, stepId, path, change: kind }));
}
const brief = z
  .string()
  .min(1)
  .max(12000)
  .refine((value) => value.trim().length > 0 && !value.includes("\0"));
const model = z.string().min(1).max(256);
export const studioAgentToolSchemas = {
  list_kernels: z.object({}).strict(),
  dispatch_task: z
    .object({
      commandId: id,
      kernel: model,
      task: brief,
      context: brief,
      permission: z.enum(["read-only", "ask", "full-access"]).optional(),
      model: model.optional(),
      reasoningEffort: model.optional(),
    })
    .strict(),
  message_task: z.object({ commandId: id, taskId: id, task: brief, context: brief }).strict(),
  get_task: z.object({ taskId: id }).strict(),
  get_result: z
    .object({
      taskId: id,
      resultId: id,
      stepId: id.optional(),
      offset: z.number().int().min(0).optional(),
      length: z.number().int().min(1).max(16000).optional(),
      artifactOffset: z.number().int().min(0).optional(),
      artifactLimit: z.number().int().min(1).max(100).optional(),
    })
    .strict(),
  request_permission: z.object({ commandId: id, title: brief, detail: brief }).strict(),
  cancel_task: z.object({ commandId: id, taskId: id }).strict(),
  get_events: z.object({}).strict(),
  ack_event: z.object({ eventId: id }).strict(),
};
export type StudioAgentToolName = keyof typeof studioAgentToolSchemas;
const state = z.enum([
  "sent",
  "accepted",
  "running",
  "completed",
  "failed",
  "needs-input",
  "cancelled",
  "cancel-unconfirmed",
]);
const artifact = z.object({
  runId: id,
  stepId: id,
  path: z.string(),
  change: z.enum(["added", "modified", "deleted"]),
});
const resultRef = z.object({
  id,
  taskId: id,
  runId: id,
  attempt: z.number().int().positive(),
  state,
  error: z.string().optional(),
  resultKnown: z.boolean().optional(),
  steps: z.array(z.object({ stepId: id, resultId: id })),
  artifacts: z.array(artifact),
  workspaces: z.array(z.object({ runId: id, stepId: id, path: z.string() })),
});
const event = z.object({
  id,
  taskId: id,
  runId: id,
  attempt: z.number().int().positive(),
  state,
  resultRef,
  delivery: z.enum(["pending", "sent", "acked", "exhausted"]),
  deliveries: z.number().int().nonnegative(),
  retryAt: z.number(),
  createdAt: z.number(),
});
const receipt = z.object({
  taskId: id.optional(),
  runId: id.optional(),
  state,
  error: z.string().optional(),
  needsUserPolicy: z.boolean().optional(),
});
const page = z.object({
  offset: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  done: z.boolean(),
});
/** Output validation lives at the same Host boundary as the input schema. */
export const studioAgentToolOutputSchemas = {
  list_kernels: z.array(
    z.object({
      kernel: z.string(),
      permission: z.enum(["read-only", "ask", "full-access"]),
      capabilities: z.object({
        resume: z.boolean(),
        approval: z.boolean(),
        questions: z.boolean(),
        readOnly: z.boolean(),
        fullAccess: z.boolean(),
      }),
      models: z.array(
        z
          .object({
            id: z.string(),
            label: z.string(),
            reasoning: z.array(z.object({ id: z.string(), label: z.string() })),
          })
          .passthrough(),
      ),
      optionsError: z.string().optional(),
    }),
  ),
  dispatch_task: receipt,
  message_task: receipt,
  cancel_task: receipt,
  request_permission: z.union([
    receipt,
    z.object({
      decision: z.enum(["allow-once", "allow-session", "deny"]),
      observed: z.literal(true),
    }),
  ]),
  get_task: z.object({
    taskId: id,
    runId: id,
    state,
    kernel: z.string(),
    permission: z.enum(["read-only", "ask", "full-access"]),
    runs: z.array(z.object({ runId: id, attempt: z.number().int().positive(), state })),
    interactions: z.array(
      z.object({
        id,
        kind: z.enum(["approval", "question"]),
        title: z.string(),
        status: z.enum(["pending", "answered", "expired"]),
      }),
    ),
    events: z.array(event),
  }),
  get_result: resultRef.extend({
    textPage: page.optional(),
    artifactPage: page.optional(),
    results: z.array(
      z.object({
        stepId: id,
        result: z
          .object({
            status: z.enum(["succeeded", "failed", "cancelled", "interrupted", "skipped"]),
            text: z.string(),
            resultKnown: z.boolean(),
          })
          .passthrough(),
      }),
    ),
  }),
  get_events: z.array(event),
  ack_event: z.object({ eventId: id, delivery: z.literal("acked") }),
};
export const studioAgentToolDescriptions: Record<StudioAgentToolName, string> = {
  list_kernels:
    "List configured Studio kernels, enforceable capabilities and model options. No account configuration or credentials are exposed.",
  dispatch_task:
    "Dispatch a selected configured Studio kernel with explicit task/context briefs into an isolated workspace. Reuse commandId after a lost response. Admission is not completion.",
  message_task:
    "Send another task/context brief to an owned child, reusing its workspace and native session. Busy children use the Studio durable queue.",
  get_task:
    "Read an owned child's state, permission interactions and immutable result references. Cancel-unconfirmed requires user inspection.",
  get_result:
    "Retrieve complete saved results and all artifact/workspace references by result ID. For long native tool results, supply stepId/offset/length for text chunks and artifactOffset/artifactLimit for file references; repeat using nextOffset until done.",
  request_permission:
    "Request a human decision through Studio. Can observe a decision; cannot answer native approvals or grant permission to a child.",
  cancel_task:
    "Request cancellation of an owned child's queued and running messages. Acceptance is not native cancellation confirmation.",
  get_events:
    "Receive durable completion, failure, cancellation or needs-input events. Retry after lost ACK replays the same event IDs. Retrieve results before acknowledging.",
  ack_event:
    "Idempotently acknowledge one owned event after receiving it. An ACK never changes the child execution result.",
};
