import type { StudioKernelId } from "./kernelTypes.js";
import type { StudioOutputRef } from "./domain/outputRef.js";

/**
 * 节点种类的唯一来源：UI 只从这个清单叠加显示类型，不再各自定义一份。
 * 运行时数组与联合类型同源，避免"清单加了、类型没加"。
 */
export const STUDIO_WORKFLOW_NODE_KINDS = [
  "start",
  "agent",
  "creation",
  "condition",
  "parallel",
  "join",
  "approval",
  "end",
] as const;
export type StudioWorkflowNodeKind = (typeof STUDIO_WORKFLOW_NODE_KINDS)[number];
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
  /**
   * 定义契约版本；缺省为 legacy。
   * 高版本定义不在本进程静默降级，由读取侧显式拒绝并保留原始记录。
   */
  version?: number;
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
  /**
   * 增量输出引用；`text` 仍然必填并保持既有语义。
   * 只保存有界引用，不内联大文本／媒体字节，见 specs/knorvia-output-contract.md。
   */
  outputs?: StudioOutputRef[];
  /**
   * 输出契约版本；缺省为 legacy（无 `outputs` 的旧记录）。
   * 高版本结果不参与缓存复用，读取侧报错并保留原始记录。
   */
  version?: number;
}
export interface StudioCheckpoint {
  steps: Record<string, StudioStepResult>;
  values: Record<string, string>;
  completedRounds: number;
  plan?: unknown;
}
