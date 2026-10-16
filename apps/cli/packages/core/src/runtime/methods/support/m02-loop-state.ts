// SPDX-License-Identifier: Apache-2.0
// 回合循环字段与紧凑计数。计数原地写在 state 上，不另做影子副本。
import type { SubagentRunOptions } from "@knorvia/contracts";
import type { RuntimeMessageEntry } from "../../../agent/message-history.js";
import type {
  CompactPhase,
  CompactReason,
  MessageId,
  Model,
  ModelStreamRecoveryStatus,
  OutputStylePromptConfig,
  SessionEvent,
  TraceContext,
  TraceId,
  TurnId,
  TurnMachineImpl,
} from "../../deps.js";
import type { ActiveTurnSteeringState, DrainedPendingInputDiagnostics } from "../../types.js";

export type PendingStreamRecoveryRequest = ModelStreamRecoveryStatus; // 一次性流恢复请求

export const RAPID_REFILL_TOOL_TURN_THRESHOLD = 3; // 距上次压缩的工具批间隔
export const MAX_CONSECUTIVE_RAPID_REFILLS = 3; // 连续灌水熔断次数

const cronName = (verb: "Create" | "Update" | "Delete") => `Cron${verb}`;
export const AUTOMATION_MUTATION_TOOL_NAMES = [
  cronName("Create"),
  cronName("Update"),
  cronName("Delete"),
] as unknown as readonly ["CronCreate", "CronUpdate", "CronDelete"];

const AUTOMATION_QUERY_PREFIX = "automation-";

export const OFF_PEAK_MUTATION_TOOL_NAMES = [
  ["OffPeak", "Create"].join(""),
  ["Send", "Message"].join(""),
  ["Work", "flow"].join(""),
] as unknown as readonly ["OffPeakCreate", "SendMessage", "Workflow"];

const OFF_PEAK_QUERY_PREFIX = "offpeak-";

export interface CompactLoopTracking {
  // m02
  consecutiveRapidRefills: number; // 已连续灌水次数
  toolTurnsSinceCompact: number; // 上次压缩后的工具批
}

export interface RapidRefillDecision {
  // m02
  consecutiveRapidRefills: number; // 本次判定后的连续次数
  shouldBlock: boolean; // 达到熔断
  toolTurnsSinceCompact: number; // 判定时读到的间隔
}

export type CompactAttemptOutcome = "skipped" | "compacted" | "failed"; // m02
export type AutoCompactOutcome = CompactAttemptOutcome | "rapid_refill_blocked"; // m02

export interface AutoCompactLoopContext {
  // m02
  compactReason: CompactReason; // 自动压缩原因
  modelStepIndex: number; // 当前模型步下标
  phase: CompactPhase; // 压缩阶段
  rapidRefill: RapidRefillDecision; // 灌水判定
  model: Model; // 本步模型
  turnRequestState: TurnRequestState; // provider 可见历史
}

export interface ReactiveCompactLoopContext {
  // m02
  activeEntries?: readonly RuntimeMessageEntry[]; // 当前请求条目
  modelStepIndex: number; // 触发步下标
  model: Model; // 触发时模型
  rapidRefillCount: number; // 连续灌水计数
  turnRequestState: TurnRequestState; // 压缩后要替换的历史
}

export interface TurnRequestState {
  // m02
  entries: readonly RuntimeMessageEntry[]; // provider 可见条目
  outputTokenContinuationCount: number; // 输出上限续写次数
}

export interface RegularTurnLoopState {
  // m02
  activeTurn?: ActiveTurnSteeringState; // 进行中的 steering 槽
  automationId?: string; // 准入显式传入的自动化身份
  offPeakTaskId?: string; // 准入显式传入的闲时身份
  automationCreateLimitReached?: boolean; // 创建上限后本轮只出文本
  anomalyWarningsInjected: number; // 已注入的异常提醒次数
  backgroundSubagentResultConsumed: boolean; // 已消费子代理后台结果
  workflowResultConsumed: boolean; // 已消费工作流后台通知
  compactTracking?: CompactLoopTracking; // 压缩循环计数，缺省表示尚未开始
  currentUserMessageId: MessageId; // 当前用户消息锚点
  drainedSteerForNextRequest?: DrainedPendingInputDiagnostics; // 下一步要带上的 steer
  events: SessionEvent[]; // 本轮事件缓冲
  input: string; // 用户输入原文
  modelResponse: string; // 最近一次模型正文
  model: Model; // 本轮固定模型
  modelSelectionScope?: "execution"; // execution 时 guide 不能改模型
  subagentModelOverride?: SubagentRunOptions["modelOverride"]; // 子代理模型覆盖
  modelStepCount: number; // 已完成的模型步
  historyRoundCount: number; // 已写入 provider 历史的轮次
  reactiveCompactAttemptedInCurrentModelStep: boolean; // 本步是否已试过反应式压缩
  repeatedToolCallSignature?: string; // 重复工具签名
  repeatedToolCallStreakCount: number; // 重复工具连续次数
  pendingStreamRecoveryRequest?: PendingStreamRecoveryRequest; // 读后必须清空
  stopHookContinuationCount: number; // stop hook 续写次数
  stableProductStartMessageId?: MessageId; // 最终产物起点，与边界成对
  stableBoundaryAssistantMessageId?: MessageId; // 最终助手边界
  streamRecoveryRetryCount: number; // 流恢复重试次数
  tokenCount: number; // 最近一次用量
  toolCallCount: number; // 累计工具调用
  turnRequestState: TurnRequestState; // 本轮 provider 历史
  toolDisallowlist?: readonly string[]; // 对模型隐藏的工具名
  traceId: TraceId; // 回合 trace
  turnAbortSignal: AbortSignal; // 回合取消信号
  turnId: TurnId; // 回合 id
  turnMachine: TurnMachineImpl; // 回合状态机
  turnOutputStyle?: OutputStylePromptConfig; // 本轮输出风格
  turnTraceContext: TraceContext; // 本轮追踪上下文
  userMessageId: MessageId; // 用户消息 id
}

function blankToEmpty(value: string | undefined): string {
  return (value ?? "").trim();
}

function deniedNames(state: RegularTurnLoopState): ReadonlySet<string> {
  return new Set(state.toolDisallowlist ?? []);
}

function queryText(state: RegularTurnLoopState): string {
  return blankToEmpty(state.turnTraceContext.queryId);
}

export function isAutomationMutationRestrictedTurn(state: RegularTurnLoopState): boolean {
  // m02
  if (blankToEmpty(state.automationId).length > 0) return true;
  if (queryText(state).startsWith(AUTOMATION_QUERY_PREFIX)) return true;
  const denied = deniedNames(state);
  return AUTOMATION_MUTATION_TOOL_NAMES.every((name) => denied.has(name));
}

export function isOffPeakCreateRestrictedTurn(state: RegularTurnLoopState): boolean {
  // m02
  if (blankToEmpty(state.offPeakTaskId).length > 0) return true;
  if (queryText(state).startsWith(OFF_PEAK_QUERY_PREFIX)) return true;
  return deniedNames(state).has(OFF_PEAK_MUTATION_TOOL_NAMES[0]);
}

function decisionOf(streak: number, sinceCompact: number): RapidRefillDecision {
  return {
    // m02
    consecutiveRapidRefills: streak,
    shouldBlock: streak >= MAX_CONSECUTIVE_RAPID_REFILLS,
    toolTurnsSinceCompact: sinceCompact,
  };
}

export function evaluateRapidRefill(
  // m02
  tracking: CompactLoopTracking | undefined, // m02
): RapidRefillDecision {
  // m02
  if (tracking === undefined) return decisionOf(0, 0);
  const sinceCompact = tracking.toolTurnsSinceCompact;
  const streak =
    sinceCompact < RAPID_REFILL_TOOL_TURN_THRESHOLD ? tracking.consecutiveRapidRefills + 1 : 0;
  return decisionOf(streak, sinceCompact);
}

export function recordCompactSuccess(
  // m02
  state: RegularTurnLoopState, // m02
  decision: RapidRefillDecision, // m02
): void {
  // m02
  state.compactTracking = {
    // m02
    consecutiveRapidRefills: decision.consecutiveRapidRefills, // m02
    toolTurnsSinceCompact: 0, // m02
  };
}

export function recordCompletedToolBatch(state: RegularTurnLoopState): void {
  // m02
  // 旗标若活过整个用户回合，下一次真实 overflow 会被挡住。
  state.reactiveCompactAttemptedInCurrentModelStep = false; // m02
  const tracking = state.compactTracking;
  if (tracking !== undefined) tracking.toolTurnsSinceCompact += 1;
}

function bumpHistory(state: RegularTurnLoopState): void {
  state.historyRoundCount += 1; // m02
}

export function recordModelHistoryRound(state: RegularTurnLoopState): void {
  // m02
  bumpHistory(state);
}

export function recordCompactHistoryRound(state: RegularTurnLoopState): void {
  // m02
  bumpHistory(state);
}
