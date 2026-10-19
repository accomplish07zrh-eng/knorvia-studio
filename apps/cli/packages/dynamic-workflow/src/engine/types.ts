// SPDX-License-Identifier: Apache-2.0
// Knorvia 工作流引擎核心类型契约。
// 定义宿主 API 边界、驱动端口、日志仓储接口、事件模型与状态机标识。

import type {
  ArtifactContentOp,
  ArtifactOp,
  ArtifactPresetOp,
  WorldReadOp,
} from "../facade/registry.js";
import type { AskProgress, AskStats } from "./ask-observation-types.js";
import type { ProviderStopDetails, RunStallInfo } from "./run-terminal.js";
import type { Violation } from "../schema/types.js";
import type { WorkflowError } from "./workflow-error.js";

// ask 或操作节点实例定位标识：站点 ID 与每站点自增序号
export interface InstanceRef {
  siteId: string;
  ordinal: number;
}

// actor 实例标识：创建站点 ID 与序号
export interface ActorRef {
  siteId: string;
  ordinal: number;
}

// 脚本层面引用的不透明 actor 句柄字符串
export type ActorId = string;

// 将实例或执行者引用格式化为标准 siteId@ordinal 字符串
export function refToString(ref: InstanceRef | ActorRef): string {
  return ref.siteId + "@" + ref.ordinal;
}

// actor 执行角色规格（名称与系统提示词）
export interface PersonaSpec {
  name?: string;
  system?: string;
}

// ask 派发参数包装
export interface AskMessage {
  instructions: string;
  typed: boolean;
  schema?: unknown;
}

export type { Violation } from "../schema/types.js";

// 模式校验函数抽象契约
export type ValidateFn = (schema: unknown, value: unknown) => Violation[];

// 单个 ask 站点的静态模式规格
export interface AskSpec {
  typed: boolean;
  schema?: unknown;
}

// 导致导入缓存关闭的副作用原因
export type ImportCloseCause = "mutating-tool" | "world-run";

// run 级别运行约束规格
export interface Caps {
  maxConcurrency: number;
}

export type { ProviderStopDetails, RunStallInfo } from "./run-terminal.js";

// 工作流稳定错误分类码
export type WorkflowErrorCode =
  | "ValidationFailed"
  | "ResultNotSubmitted"
  | "DriverError"
  | "WorldReadCapExceeded"
  | "Cancelled"
  | "ContextLimit"
  | "ReportCapExceeded"
  | "InputHashMismatch"
  | "UnknownActor"
  | "MissingAskSpec"
  | "DuplicateActorName"
  | "ScriptHashMismatch"
  | "Interrupted"
  | "ProviderStop"
  | "ArtifactSourceMissing"
  | "ArtifactPathOutsideWorkspace"
  | "ArtifactTooLarge"
  | "ArtifactStoreUnavailable"
  | "ArtifactVersionCapExceeded"
  | "ArtifactKindMismatch"
  | "ArtifactCapExceeded"
  | "ArtifactSpecInvalid"
  | "ArtifactRedeclared"
  | "ArtifactUndeclared"
  | "ArtifactPrimaryConflict";

// 结构化预期与实际差异
export interface WorkflowErrorMismatch {
  expected: string;
  got: string;
}

// 可落库序列化的错误明细模型
export interface WorkflowErrorJson {
  code: WorkflowErrorCode;
  message: string;
  violations?: Violation[];
  finalText?: string;
  mismatch?: WorkflowErrorMismatch;
  providerStop?: ProviderStopDetails;
}

export { WorkflowError } from "./workflow-error.js";

export type {
  ArtifactContentOp,
  ArtifactOp,
  ArtifactPresetOp,
  WorldReadOp,
} from "../facade/registry.js";

// 用户面产物发布引用句柄
export interface ArtifactRef {
  id: string;
  version: number;
}

// 产物版本的持久化落库记录
export interface ArtifactVersionRecord {
  id: string;
  kind: ArtifactOp;
  version: number;
  title?: string;
  description?: string;
  contentType?: string;
  bytes?: number;
  uri?: string;
  sourcePath?: string;
  spec?: unknown;
  publishedAt?: number;
  primary?: true;
}

// 经由驱动层发布内容类产物的请求
export interface ArtifactPublishRequest {
  runId: string;
  siteId: string;
  ordinal: number;
  op: ArtifactContentOp;
  id: string;
  version: number;
  path?: string;
  content?: string;
  opts?: unknown;
}

// 沙箱脚本调用执行引擎的底层宿主 API
export interface WorkflowHostApi {
  createActor(siteId: string, name?: string, persona?: string | PersonaSpec): ActorId;
  ask(siteId: string, actor: ActorId, instructions: string): Promise<unknown>;
  worldRead(siteId: string, op: WorldReadOp, args: unknown[]): Promise<unknown>;
  report(siteId: string, item: unknown, artifactId?: string): void;
  enterPhase(name: string): void;
  publishArtifact(siteId: string, op: ArtifactContentOp, args: unknown[]): Promise<ArtifactRef>;
  declareArtifact(siteId: string, op: ArtifactPresetOp, args: unknown[]): void;
  log(message: string): void;
}

// actor 关联的模型会话引用
export interface SessionRef {
  readonly id: string;
}

// 引擎对子代理提交结果的判定裁决
export type SubmitVerdict =
  | { kind: "accept" }
  | { kind: "reject"; violations: Violation[] }
  | { kind: "nudge" };

// 引擎与外围执行环境交互的驱动层契约
export interface WorkflowDriver {
  createActorSession(
    actor: ActorRef,
    persona: PersonaSpec,
    seed?: ActorSessionSeed,
  ): Promise<SessionRef>;
  startAsk(session: SessionRef, instance: InstanceRef, message: AskMessage): void;
  respondToSubmit(instance: InstanceRef, verdict: SubmitVerdict): void;
  cancelAsk(instance: InstanceRef): void;
  executeWorldRead(op: WorldReadOp, args: unknown[]): Promise<unknown>;
  executeArtifactPublish?(request: ArtifactPublishRequest): Promise<ArtifactVersionRecord>;
  journal: JournalStorePort;
  emit(event: RunEvent): void;
  dispose?(): void;
}

// 等待排队或退避重试的信息
export interface AskWaitInfo {
  cause: "slot" | "backoff";
  reason?: string;
  attempt?: number;
  delayMs?: number;
  retryAfterMs?: number;
}

// 并发容量变更触发原因
export type ConcurrencyChangeReason =
  | "rate_limited"
  | "provider_overloaded"
  | "offpeak_queued"
  | "recovered"
  | "idle_reset";

// 进程级并发容量动态调配事件载荷
export interface ConcurrencyChange {
  key: string;
  previous: number;
  next: number;
  reason: ConcurrencyChangeReason;
  lastGood?: number;
  lastBad?: number;
  cooldownMs?: number;
}

// 驱动层向引擎上报进度与事件的回调槽
export interface WorkflowReportSink {
  askSubmitAttempted(instance: InstanceRef, payload: unknown): void;
  askTurnEnded(instance: InstanceRef, finalText: string): void;
  askProgress(instance: InstanceRef, progress: AskProgress): void;
  askStats(instance: InstanceRef, stats: AskStats): void;
  askFailed(instance: InstanceRef, error: WorkflowError): void;
  stopRun(error: WorkflowError): void;
  runStalled(info: RunStallInfo): void;
  askWaiting(instance: InstanceRef, info: AskWaitInfo): void;
  askExecuting(instance: InstanceRef): void;
  askMutating(instance: InstanceRef): void;
  concurrencyChanged(change: ConcurrencyChange): void;
}

// 执行图中的节点类型分类
export type NodeKind = "ask" | "world-read" | "world-run" | "report" | "artifact";

// 记录到日志中的受限环境感知输入
export interface WorldReadInput {
  op: string;
  args: unknown[];
  truncated?: true;
}

// 节点输入记录最大序列化字节限制
export const WORLD_READ_INPUT_MAX_BYTES = 4096;

// 节点结算终态分类
export type NodeOutcome = "ok" | "failed" | "cancelled";

// 运行生命周期状态
export type RunStatus = "pending" | "running" | "completed" | "errored" | "stopped";

// 运行停止原因
export type RunStopReason = "user" | "model" | "provider" | "interrupted" | "superseded";

// 引擎与执行流产生的全量事件联合定义
export type RunEvent =
  | { type: "run-started"; runId: string; caps: Caps }
  | {
      type: "run-launched";
      inputId: string;
      toolCallId?: string;
      parentSessionId?: string;
      phaseNames?: string[];
      subagentModel?: string;
      scriptPath?: string;
      phaseAlongside?: number[][];
    }
  | {
      type: "actor-created";
      actor: ActorRef;
      name?: string;
      persona?: PersonaSpec;
      phaseName?: string;
    }
  | {
      type: "node-queued";
      instance: InstanceRef;
      kind: NodeKind;
      actor?: ActorRef;
      actorSeq?: number;
      phaseName?: string;
      instructionsHead?: string;
    }
  | { type: "node-dispatched"; instance: InstanceRef }
  | { type: "node-repairing"; instance: InstanceRef; attempt: number; violations: Violation[] }
  | { type: "node-nudged"; instance: InstanceRef }
  | ({ type: "node-waiting"; instance: InstanceRef } & AskWaitInfo)
  | { type: "node-executing"; instance: InstanceRef }
  | ({ type: "concurrency-changed" } & ConcurrencyChange)
  | {
      type: "node-settled";
      instance: InstanceRef;
      outcome: NodeOutcome;
      cached?: boolean;
      error?: WorkflowErrorJson;
      phaseName?: string;
    }
  | ({ type: "node-progress"; instance: InstanceRef } & AskProgress)
  | { type: "usage-updated"; spentTokens: number }
  | { type: "log"; message: string }
  | {
      type: "import-cache-closed";
      instance: InstanceRef;
      cause: ImportCloseCause;
      actorName?: string;
    }
  | { type: "phase-entered"; name: string; ordinal: number }
  | { type: "report"; instance: InstanceRef; item: unknown; artifactId?: string }
  | { type: "artifact-published"; instance: InstanceRef; artifact: ArtifactVersionRecord }
  | {
      type: "artifact-failed";
      instance: InstanceRef;
      id: string;
      op: ArtifactContentOp;
      error: WorkflowErrorJson;
    }
  | { type: "compaction"; actor: ActorRef }
  | {
      type: "escalation-raised";
      qid: string;
      actor: ActorRef;
      actorName?: string;
      question: string;
      context?: string;
      askedAt: number;
    }
  | { type: "escalation-resolved"; qid: string; answer: string }
  | ({ type: "run-stalled" } & RunStallInfo)
  | {
      type: "run-settled";
      status: RunStatus;
      stopReason?: RunStopReason;
      supersededBy?: string;
      error?: WorkflowErrorJson;
    };

// 工作流运行总体持久化记录模型
export interface RunRecord {
  runId: string;
  parentSessionId?: string;
  cwd?: string;
  name?: string;
  toolCallId?: string;
  scriptText?: string;
  scriptHash?: string;
  args?: Record<string, unknown>;
  resumedFrom?: string;
  caps: Caps;
  spentTokens: number;
  status: RunStatus;
  stopReason?: RunStopReason;
  supersededBy?: string;
  failure?: WorkflowErrorJson;
  result?: unknown;
}

// actor 实例持久化记录模型
export interface ActorRecord {
  runId: string;
  siteId: string;
  ordinal: number;
  name?: string;
  persona?: PersonaSpec;
  sessionId?: string;
  resolvedModel?: string;
}

// 节点执行持久化状态枚举
export type NodeRecordStatus = "running" | "completed" | "failed";

// 单个执行节点持久化记录模型
export interface NodeRecord {
  runId: string;
  siteId: string;
  ordinal: number;
  kind: NodeKind;
  actorSiteId?: string;
  actorOrdinal?: number;
  actorSeq?: number;
  inputHash: string;
  status: NodeRecordStatus;
  result?: unknown;
  error?: WorkflowErrorJson;
  stats?: AskStats;
  artifactId?: string;
  input?: WorldReadInput;
  messageBoundary?: number;
}

// 包含自增序列号的已持久化事件模型
export interface StoredEvent {
  sequence: number;
  event: RunEvent;
  timeCreated?: number;
}

// 查询事件时的游标分页过滤选项
export interface ListEventsOptions {
  afterSequence?: number;
  limit?: number;
}

// 运行终结结算持久化载荷
export interface RunSettlementRecord {
  stopReason?: RunStopReason;
  supersededBy?: string;
  failure?: WorkflowErrorJson;
  result?: unknown;
}

// 日志仓储持久化端口规范
export interface JournalStorePort {
  createRun(record: RunRecord): void;
  getRun(runId: string): RunRecord | undefined;
  updateRunStatus(runId: string, status: RunStatus, settlement?: RunSettlementRecord): void;
  updateRunUsage(runId: string, spentTokens: number): void;
  putActor(record: ActorRecord): void;
  getActor(runId: string, siteId: string, ordinal: number): ActorRecord | undefined;
  listActors(runId: string): ActorRecord[];
  putNode(record: NodeRecord): void;
  getNode(runId: string, siteId: string, ordinal: number): NodeRecord | undefined;
  listNodes(runId: string): NodeRecord[];
  appendEvent(runId: string, event: RunEvent): StoredEvent;
  listEvents(runId: string, opts?: ListEventsOptions): StoredEvent[];
}

export {
  INSTRUCTIONS_HEAD_MAX_CHARS,
  LAST_TOOL_NAME_MAX_CHARS,
  LAST_TOOL_TARGET_MAX_CHARS,
} from "./ask-observation-types.js";
export type { AskLastTool, AskProgress, AskStats } from "./ask-observation-types.js";

export type {
  ImportedActorCandidate,
  ImportedAskEntry,
  ImportedRunCache,
  ImportedWorldEntry,
} from "./imported-cache-types.js";

// 断点恢复时用于初始化 actor 会话的消息边界与种子
export interface ActorSessionSeed {
  sourceSessionId: string;
  messageCount: number;
  resolvedModel?: string;
}

// 节点自动修复与重新提示上限常数
export const REPAIR_ATTEMPTS = 3;
export const NUDGE_ATTEMPTS = 1;
