import type {
  StudioKernelConfig,
  StudioKernelId,
  StudioKernelInteraction,
  StudioChatSelection,
  StudioKernelUsage,
} from "./kernelTypes.js";
import type {
  StudioCheckpoint,
  StudioGroupDefinition,
  StudioWorkflowDefinition,
} from "./workflowTypes.js";

export type StudioRunState =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";
export interface StudioConversation {
  selection?: StudioChatSelection;
  id: string;
  kernel: StudioKernelId;
  workspacePath: string;
  title: string;
  nativeSessionId?: string;
  createdAt: number;
  updatedAt: number;
}
export interface StudioMessage {
  sequence?: number;
  id: string;
  targetId: string;
  runId: string;
  turnId?: string;
  sender: "user" | StudioKernelId | "system";
  kind: "text" | "reasoning" | "tool" | "progress";
  text: string;
  name?: string;
  state?: string;
  createdAt: number;
  updatedAt: number;
}
export interface StudioInteraction extends StudioKernelInteraction {
  runId: string;
  turnId: string;
  kernel?: StudioKernelId;
  status: "pending" | "answered" | "expired";
}
export interface StudioRun {
  workspaceStepIds?: string[];
  kernelConfig?: StudioKernelConfig;
  id: string;
  kind: "chat" | "group" | "workflow";
  targetId: string;
  state: StudioRunState;
  input: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
  resultKnown?: boolean;
  checkpoint: StudioCheckpoint;
  attempt: number;
  cancelRequested?: boolean;
  taskMode?: boolean;
  definition?: StudioGroupDefinition | StudioWorkflowDefinition;
}
export interface StudioTurnSnapshot {
  id: string;
  runId: string;
  stepId: string;
  state: string;
  attempt: number;
  memberId?: StudioKernelId;
  startedAt?: number;
  endedAt?: number;
}
export interface StudioGroupMemberMetrics {
  member: StudioKernelId;
  /** Sum of reported fields only; partial marks missing or request-scoped usage. */
  tokens?: number;
  durationMs?: number;
  tokensPartial: boolean;
  durationPartial: boolean;
}
export interface StudioGroupMetrics {
  runId: string;
  members: StudioGroupMemberMetrics[];
  total: Omit<StudioGroupMemberMetrics, "member">;
  truncated: boolean;
}
export interface StudioOverview {
  revision: number;
  configs: Partial<Record<StudioKernelId, StudioKernelConfig>>;
  conversations: StudioConversation[];
  groups: StudioGroupDefinition[];
  workflows: StudioWorkflowDefinition[];
  runs: StudioRun[];
}
export interface StudioTimeline {
  revision: number;
  nextBefore?: number;
  messages: StudioMessage[];
  interactions: StudioInteraction[];
  runs: StudioRun[];
  turns?: StudioTurnSnapshot[];
  usage?: StudioKernelUsage & { runId: string; turnId: string };
  groupMetrics?: StudioGroupMetrics;
}
export interface StudioWorkspaceChange {
  path: string;
  kind: "added" | "modified" | "deleted";
  before: string | null;
  after: string | null;
  binary?: boolean;
  conflict?: boolean;
}
