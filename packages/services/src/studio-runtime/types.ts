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
  turns?: Array<{ id: string; runId: string; stepId: string; state: string; attempt: number }>;
  usage?: StudioKernelUsage & { runId: string; turnId: string };
}
export interface StudioWorkspaceChange {
  path: string;
  kind: "added" | "modified" | "deleted";
  before: string | null;
  after: string | null;
  binary?: boolean;
  conflict?: boolean;
}
