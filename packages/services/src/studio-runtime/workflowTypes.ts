import type { StudioKernelId } from "./kernelTypes.js";

export type StudioWorkflowNodeKind =
  | "start"
  | "agent"
  | "creation"
  | "condition"
  | "parallel"
  | "join"
  | "approval"
  | "end";
export interface StudioWorkflowNodeData {
  kind: StudioWorkflowNodeKind;
  label: string;
  kernel: StudioKernelId;
  prompt: string;
  condition: string;
  retryCount: number;
  retryDelay: number;
  joinPolicy: "all" | "any";
  creationModelId?: string;
  creationReferencePath?: string;
  [key: string]: unknown;
}
export interface StudioWorkflowNode {
  id: string;
  data: StudioWorkflowNodeData;
  position: { x: number; y: number };
  type?: string;
}
export interface StudioWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
}
export interface StudioWorkflowDefinition {
  id: string;
  name: string;
  workspacePath: string | null;
  nodes: StudioWorkflowNode[];
  edges: StudioWorkflowEdge[];
  updatedAt: number;
  workspaceMode?: "isolated" | "shared";
}
export interface StudioGroupDefinition {
  id: string;
  name: string;
  goal: string;
  members: StudioKernelId[];
  host: StudioKernelId;
  sharedSummary: string;
  mode: "manual" | "task";
  workspaceMode: "isolated" | "shared";
  workspacePath?: string;
  createdAt: number;
  updatedAt: number;
}
export interface StudioStepResult {
  status: "succeeded" | "failed" | "cancelled" | "interrupted" | "skipped";
  text: string;
  error?: string;
  resultKnown: boolean;
  retryable?: boolean;
  /** Host-observed workspace evidence; never accepted from member prose. */
  workspacePath?: string;
  changesSummary?: string;
}
export interface StudioCheckpoint {
  steps: Record<string, StudioStepResult>;
  values: Record<string, string>;
  completedRounds: number;
  plan?: unknown;
}
