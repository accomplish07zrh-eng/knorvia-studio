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
  /**
   * 交付结论：读时派生的只读投影（见 specs/knorvia-delivery-summary.md）。
   * 不存在第二份状态：本字段永远由 Host 证据推导，绝不写回记录。
   */
  outcome?: StudioRunOutcome;
}

/** 交付结论类别；模型文字永远不能把它提升到 `produced` 以上。 */
export type StudioDeliveryOutcome = "produced" | "checked" | "unverified" | "unknown";
/** 交付证据来源，按优先级从高到低排列。 */
export type StudioDeliveryEvidence =
  | "host-hash"
  | "apply-journal"
  | "creation-record"
  | "kernel-tool-state"
  | "model-claim"
  | "none";
/** 重启后可显示的三种状态；已接受且未再改动时没有可显示状态。 */
export type StudioRestartDisplayState =
  | "applied-refresh-failed"
  | "partial-unknown"
  | "accepted-later-modified";
export type StudioAcceptanceConfirmation = "host-verified" | "host-journal" | "remote-returned";
export type StudioAcceptanceResult =
  | "accepted"
  | "applied-unverified"
  | "remote-unverified"
  | "failed";
/** 与 `adapters/workspaceJournal.ts` 的 `JournalState` 同义；这里只作为载荷字面量，避免反向导入适配器。 */
export type StudioApplyJournalState =
  | "preparing"
  | "applying"
  | "rolling-back"
  | "complete"
  | "rolled-back"
  | "rollback-incomplete";
/** apply-lock 的只读视图；`phase` 表示应用/核验是否仍在进行。 */
export interface StudioApplyLockState {
  recoveryRequired?: boolean;
  phase?: "applying" | "verifying";
  operationId?: string;
  startedAt?: number;
}
export interface StudioAcceptedFileVersion {
  path: string;
  afterHash: string | null;
}
export interface StudioAppliedFile {
  path: string;
  afterHash: string | null;
}
/**
 * 应用回执：`operationId` 由**执行应用的 Host** 生成，与该次 apply journal 文件名同源。
 * 远端 Host 的摘要不能被本地 Host 当作已验证事实。
 */
export interface StudioApplyReceipt {
  operationId: string;
  files: StudioAppliedFile[];
  /** 选中路径中已与项目一致而被跳过的数量。 */
  skipped?: number;
  journalState: StudioApplyJournalState;
}
/** 项目文件的当前哈希；`null` 表示文件不存在。 */
export interface StudioFileVersion {
  path: string;
  hash: string | null;
}
/**
 * 验收记录：本地 Host 在"应用 + 独立重读核验"成功后写入的辅助证据。
 * 它**不是**任务状态机，永不作为任务终态被读回。
 */
export interface StudioApplyAcceptance {
  version: 1;
  runId: string;
  stepId: string;
  projectKey: string;
  operationId: string;
  acceptedAt: number;
  paths: string[];
  fileVersions: StudioAcceptedFileVersion[];
  creation?: { jobId: string; outputIds: string[] } | null;
  confirmation: StudioAcceptanceConfirmation;
  result: StudioAcceptanceResult;
  journalState?: StudioApplyJournalState;
}
export interface StudioRunStepOutcome {
  stepId: string;
  outcome: StudioDeliveryOutcome;
  /** 按优先级排列的证据来源；`model-claim` 只说明"这是声明"，不代表成立。 */
  evidence: StudioDeliveryEvidence[];
  /** 隔离目录所属的 workspace 步骤 id（群聊成员为成员 id）；用于定位隔离改动。 */
  workspaceStepId?: string;
  workspacePath?: string;
  /** 该步骤最新一条验收记录（只读证据）；UI 用它配合复核读取判定重启后显示状态。 */
  acceptance?: StudioApplyAcceptance;
  restart?: StudioRestartDisplayState;
}
export interface StudioRunOutcome {
  outcome: StudioDeliveryOutcome;
  evidence: StudioDeliveryEvidence[];
  steps: StudioRunStepOutcome[];
  restart?: StudioRestartDisplayState;
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
