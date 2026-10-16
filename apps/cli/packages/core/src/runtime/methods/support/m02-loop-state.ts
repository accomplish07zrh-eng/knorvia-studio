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
import { assignKeys, type Col, type Opt } from "./m02-record.js";

export type PendingStreamRecoveryRequest = ModelStreamRecoveryStatus;

export const RAPID_REFILL_TOOL_TURN_THRESHOLD = 3;
export const MAX_CONSECUTIVE_RAPID_REFILLS = 3;

export const AUTOMATION_MUTATION_TOOL_NAMES = ["CronCreate", "CronUpdate", "CronDelete"] as const;

const AUTOMATION_QUERY_PREFIX = "automation-";

// OffPeakList 只读，不在这张拒绝表里。不能并进 automation 的名单，否则定时任务会误伤 OffPeakCreate。
export const OFF_PEAK_MUTATION_TOOL_NAMES = ["OffPeakCreate", "SendMessage", "Workflow"] as const;

const OFF_PEAK_QUERY_PREFIX = "offpeak-";

export type CompactLoopTracking = Col<"consecutiveRapidRefills", number> &
  Col<"toolTurnsSinceCompact", number>;

export type RapidRefillDecision = Col<"consecutiveRapidRefills", number> &
  Col<"shouldBlock", boolean> &
  Col<"toolTurnsSinceCompact", number>;

export type CompactAttemptOutcome = "skipped" | "compacted" | "failed";
export type AutoCompactOutcome = CompactAttemptOutcome | "rapid_refill_blocked";

export type AutoCompactLoopContext = Col<"compactReason", CompactReason> &
  Col<"modelStepIndex", number> &
  Col<"phase", CompactPhase> &
  Col<"rapidRefill", RapidRefillDecision> &
  Col<"model", Model> &
  Col<"turnRequestState", TurnRequestState>;

export type ReactiveCompactLoopContext = Opt<"activeEntries", readonly RuntimeMessageEntry[]> &
  Col<"modelStepIndex", number> &
  Col<"model", Model> &
  Col<"rapidRefillCount", number> &
  Col<"turnRequestState", TurnRequestState>;

export type TurnRequestState = Col<"entries", readonly RuntimeMessageEntry[]> &
  Col<"outputTokenContinuationCount", number>;

export type RegularTurnLoopState = Opt<"activeTurn", ActiveTurnSteeringState> &
  Opt<"automationId", string> &
  Opt<"offPeakTaskId", string> &
  Opt<"automationCreateLimitReached", boolean> &
  Col<"anomalyWarningsInjected", number> &
  Col<"backgroundSubagentResultConsumed", boolean> &
  Col<"workflowResultConsumed", boolean> &
  Opt<"compactTracking", CompactLoopTracking> &
  Col<"currentUserMessageId", MessageId> &
  Opt<"drainedSteerForNextRequest", DrainedPendingInputDiagnostics> &
  Col<"events", SessionEvent[]> &
  Col<"input", string> &
  Col<"modelResponse", string> &
  Col<"model", Model> &
  Opt<"modelSelectionScope", "execution"> &
  Opt<"subagentModelOverride", SubagentRunOptions["modelOverride"]> &
  Col<"modelStepCount", number> &
  Col<"historyRoundCount", number> &
  Col<"reactiveCompactAttemptedInCurrentModelStep", boolean> &
  Opt<"repeatedToolCallSignature", string> &
  Col<"repeatedToolCallStreakCount", number> &
  Opt<"pendingStreamRecoveryRequest", PendingStreamRecoveryRequest> &
  Col<"stopHookContinuationCount", number> &
  Opt<"stableProductStartMessageId", MessageId> &
  Opt<"stableBoundaryAssistantMessageId", MessageId> &
  Col<"streamRecoveryRetryCount", number> &
  Col<"tokenCount", number> &
  Col<"toolCallCount", number> &
  Col<"turnRequestState", TurnRequestState> &
  Opt<"toolDisallowlist", readonly string[]> &
  Col<"traceId", TraceId> &
  Col<"turnAbortSignal", AbortSignal> &
  Col<"turnId", TurnId> &
  Col<"turnMachine", TurnMachineImpl> &
  Opt<"turnOutputStyle", OutputStylePromptConfig> &
  Col<"turnTraceContext", TraceContext> &
  Col<"userMessageId", MessageId>;

function trimmed(value: string | undefined): string {
  return (value ?? "").trim();
}

function blockedToolNames(loop: RegularTurnLoopState): ReadonlySet<string> {
  return new Set(loop.toolDisallowlist ?? []);
}

function queryLabel(loop: RegularTurnLoopState): string {
  return trimmed(loop.turnTraceContext.queryId);
}

export function isAutomationMutationRestrictedTurn(loop: RegularTurnLoopState): boolean {
  // 身份已经标明时不能再读 queryId：有的调用只传 automationId，trace 还不存在。
  const named = trimmed(loop.automationId).length > 0;
  if (named) return named;
  const prefixed = queryLabel(loop).startsWith(AUTOMATION_QUERY_PREFIX);
  if (prefixed) return prefixed;
  const denied = blockedToolNames(loop);
  return AUTOMATION_MUTATION_TOOL_NAMES.every((name) => denied.has(name));
}

export function isOffPeakCreateRestrictedTurn(loop: RegularTurnLoopState): boolean {
  const named = trimmed(loop.offPeakTaskId).length > 0;
  if (named) return named;
  const prefixed = queryLabel(loop).startsWith(OFF_PEAK_QUERY_PREFIX);
  if (prefixed) return prefixed;
  // 哨兵只看名单第一项 OffPeakCreate。旧派发的拒绝表可能还没带上后来加的工具。
  return blockedToolNames(loop).has(OFF_PEAK_MUTATION_TOOL_NAMES[0]);
}

function refillDecision(streak: number, sinceCompact: number): RapidRefillDecision {
  const blocked = streak >= MAX_CONSECUTIVE_RAPID_REFILLS;
  return assignKeys<RapidRefillDecision>([
    ["consecutiveRapidRefills", streak],
    ["shouldBlock", blocked],
    ["toolTurnsSinceCompact", sinceCompact],
  ]);
}

export function evaluateRapidRefill(memory: CompactLoopTracking | undefined): RapidRefillDecision {
  // 还没有 tracking 时连续次数是 0，不能当成「上一次 + 1」。
  if (memory === undefined) return refillDecision(0, 0);
  const sinceCompact = memory.toolTurnsSinceCompact;
  const stillRapid = sinceCompact < RAPID_REFILL_TOOL_TURN_THRESHOLD;
  const streak = stillRapid ? memory.consecutiveRapidRefills + 1 : 0;
  return refillDecision(streak, sinceCompact);
}

export function recordCompactSuccess(
  loop: RegularTurnLoopState,
  verdict: RapidRefillDecision,
): void {
  loop.compactTracking = assignKeys<CompactLoopTracking>([
    ["consecutiveRapidRefills", verdict.consecutiveRapidRefills],
    ["toolTurnsSinceCompact", 0],
  ]);
}

export function recordCompletedToolBatch(loop: RegularTurnLoopState): void {
  // 旗标若活过整个用户回合，下一次真实 overflow 会被挡住。
  loop.reactiveCompactAttemptedInCurrentModelStep = false;
  const memory = loop.compactTracking;
  if (memory === undefined) return;
  memory.toolTurnsSinceCompact = memory.toolTurnsSinceCompact + 1;
}

function noteHistoryRound(loop: RegularTurnLoopState): void {
  loop.historyRoundCount = loop.historyRoundCount + 1;
}

export function recordModelHistoryRound(loop: RegularTurnLoopState): void {
  noteHistoryRound(loop);
}

export function recordCompactHistoryRound(loop: RegularTurnLoopState): void {
  noteHistoryRound(loop);
}
