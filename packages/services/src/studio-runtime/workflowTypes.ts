import type { StudioKernelId, StudioPermission } from "./kernelTypes.js";
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

/**
 * 节点参数类型。值一律以字符串承载，避免把界面输入直接当成运行时类型。
 * 见 specs/knorvia-host-references.md 第 4 节。
 */
export const STUDIO_WORKFLOW_PARAM_TYPES = ["text", "number", "boolean"] as const;
export type StudioWorkflowParamType = (typeof STUDIO_WORKFLOW_PARAM_TYPES)[number];
export interface StudioWorkflowParam {
  /** 提示词里用 `{{param.<name>}}` 引用。 */
  name: string;
  label?: string;
  type: StudioWorkflowParamType;
  /** 缺省值；`required` 且无缺省值时提交必须给出值。 */
  default?: string;
  required?: boolean;
}
/** 提交值/冻结值的形状。 */
export type StudioWorkflowParamValues = Record<string, string>;
/** `run.checkpoint.values` 里冻结运行级授权的保留键。 */
export const STUDIO_WORKFLOW_PERMISSION_KEY = "workflow-permission";
/** `run.checkpoint.values` 里冻结参数值的保留键。 */
export const STUDIO_WORKFLOW_PARAMS_KEY = "workflow-params";
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
  /** 该节点声明的参数 schema；提示词用 `{{param.<name>}}` 引用。 */
  params?: StudioWorkflowParam[];
  /** 该节点声明会产出的输出名；下游用 `{{ref.<name>}}` 引用。 */
  outputNames?: string[];
  /** 该节点的执行要求；与运行授权取更严格的一方，见第 6 节。 */
  permission?: StudioPermission;
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
