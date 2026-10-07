import type { StudioKernelId, StudioPermission } from "./kernelTypes.js";
import type { StudioStepResult } from "./workflowTypes.js";

export interface StudioAgentPolicy {
  maxActive: number;
  maxTasks: number;
  maxDepth: number;
  maxRounds: number;
  maxAttempts: number;
  timeoutMs: number;
  deliveryAttempts: number;
  retryMs: number;
}
export type StudioAgentTaskState =
  | "sent"
  | "accepted"
  | "running"
  | "completed"
  | "failed"
  | "needs-input"
  | "cancelled"
  | "cancel-unconfirmed";
export interface StudioAgentTask {
  id: string;
  parentRunId: string;
  parentCallerId: string;
  parentAttempt: number;
  rootRunId: string;
  depth: number;
  targetId: string;
  runId: string;
  kernel: StudioKernelId;
  permission: StudioPermission;
  model?: string;
  reasoningEffort?: string;
  rounds: number;
  createdAt: number;
  workspace: { runId: string; stepId: string; path: string; sourcePath: string };
}
export interface StudioAgentResultRef {
  id: string;
  taskId: string;
  runId: string;
  attempt: number;
  state: StudioAgentTaskState;
  error?: string;
  resultKnown?: boolean;
  steps: Array<{ stepId: string; resultId: string }>;
  workspaces: Array<{ runId: string; stepId: string; path: string }>;
  artifacts: StudioAgentArtifactRef[];
}
export interface StudioAgentArtifactRef {
  runId: string;
  stepId: string;
  path: string;
  change: "added" | "modified" | "deleted";
}
export interface StudioAgentEvent {
  id: string;
  taskId: string;
  runId: string;
  attempt: number;
  state: StudioAgentTaskState;
  resultRef: StudioAgentResultRef;
  delivery: "pending" | "sent" | "acked" | "exhausted";
  deliveries: number;
  retryAt: number;
  createdAt: number;
}
/** Bound by the Host to a live turn; no caller/run/approval fields in tool input. */
export interface StudioAgentTools {
  call(name: string, input: unknown): Promise<unknown>;
}
export interface StudioAgentFullResult extends StudioAgentResultRef {
  results: Array<{ stepId: string; result: StudioStepResult }>;
  textPage?: { offset: number; nextOffset: number; total: number; done: boolean };
  artifactPage?: { offset: number; nextOffset: number; total: number; done: boolean };
}
