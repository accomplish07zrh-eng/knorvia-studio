// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// microcompact 的执行模块：调用方把归一化后的默认值（文案、工具白名单与四组阈值）传进来，
// 本模块只负责判定与改写，自身不含任何对外可见的常量。公开面见 ./microcompact.js。
import {
  MicrocompactStrategy,
  MicrocompactTrigger,
  modelMessageContentToText,
  type ModelMessageContent,
  type ModelMessageContentBlock,
  type ToolCallId,
} from "@knorvia/contracts";
import { estimateMessageTokens } from "./manual.js";
import type {
  LocalMicrocompactBoundaryPayload,
  LocalMicrocompactDecision,
  LocalMicrocompactMessage,
  LocalMicrocompactPolicyConfig,
  LocalMicrocompactResult,
} from "./microcompact.js";

/** 空闲触发的时间换算基准。 */
const MINUTE_IN_MILLISECONDS = 60_000;

/** 公开面在调用时传入的运行期默认值，是阈值与文案的唯一来源。 */
export interface MicrocompactRuntimeDefaults {
  clearedText: string;
  compactableTools: readonly string[];
  idleThresholdMinutes: number;
  keepRecentToolResults: number;
  minTokenSavings: number;
  thresholdBufferTokens: number;
  thresholdRatio: number;
}

/** 一次 microcompact 请求；形状与公开面签名一致。 */
export interface MicrocompactPassRequest<T extends LocalMicrocompactMessage> {
  config?: LocalMicrocompactPolicyConfig;
  lastAssistantCompletedAtMs?: number;
  messages: readonly T[];
  nowMs?: number;
}

/** 被选中的旧工具结果：它在消息数组里的位置，以及它所属的工具调用 id。 */
interface ClearableSlot {
  at: number;
  callId: string;
}

/**
 * 阈值取「比例上限」与「上下文窗口内的缓冲余量」中的较小者，并压到不小于 0。
 * 比例上限先向下取整，缓冲余量直接相减；两者都可能为负（窗口很小时）。
 */
export function buildMicrocompactThreshold(
  autoCompactThreshold: number,
  defaults: MicrocompactRuntimeDefaults,
): number {
  const byRatio = Math.floor(autoCompactThreshold * defaults.thresholdRatio);
  const byBuffer = autoCompactThreshold - defaults.thresholdBufferTokens;
  return Math.max(0, Math.min(byRatio, byBuffer));
}

/**
 * 本地微压缩主流程：先判定是否触发，再按保留组数挑出可清理的旧工具结果。
 * 返回的 messages 一律是入参的深一层副本；命中清理但节省不足时回退到未改动的副本。
 */
export function applyMicrocompactPass<T extends LocalMicrocompactMessage>(
  request: MicrocompactPassRequest<T>,
  defaults: MicrocompactRuntimeDefaults,
): LocalMicrocompactResult<T> {
  const policy = request.config ?? {};
  const working = request.messages.map(copyMicrocompactMessage);
  const estimated = estimateMessageTokens(working);
  const threshold = floorIfUsable(policy.thresholdTokens);

  if (policy.enabled === false) {
    return wrapResult(working, describeDecision(estimated, "disabled", threshold));
  }

  const trigger = detectTrigger(request, estimated, threshold, defaults);
  if (trigger === undefined) {
    return wrapResult(working, describeDecision(estimated, "not_triggered", threshold));
  }

  const runs = collectClearableRuns(working, policy, defaults);
  if (runs.length === 0) {
    return wrapResult(working, describeDecision(estimated, "no_candidates", threshold, trigger));
  }

  const keepRecent = Math.max(
    1,
    floorIfUsable(policy.keepRecentToolResults) ?? defaults.keepRecentToolResults,
  );
  const clearRunCount = Math.max(0, runs.length - keepRecent);
  if (clearRunCount === 0) {
    return wrapResult(working, describeDecision(estimated, "nothing_to_clear", threshold, trigger));
  }

  const dropped = flattenRuns(runs.slice(0, clearRunCount));
  const retained = flattenRuns(runs.slice(clearRunCount));
  for (const slot of dropped) {
    const target = working[slot.at];
    if (target === undefined) continue;
    target.content = defaults.clearedText;
  }

  const afterClear = estimateMessageTokens(working);
  const saved = Math.max(0, estimated - afterClear);
  const minimum = floorIfUsable(policy.minTokenSavings) ?? defaults.minTokenSavings;
  if (saved < minimum) {
    const untouched = request.messages.map(copyMicrocompactMessage);
    return wrapResult(
      untouched,
      describeDecision(estimated, "below_min_savings", threshold, trigger),
    );
  }

  const payload = buildBoundaryPayload(estimated, afterClear, saved, dropped, retained, trigger);
  return wrapResult(working, describeDecision(estimated, "applied", threshold, trigger), payload);
}

/** 空闲触发优先于 token 压力；两者都不成立时返回 undefined。 */
function detectTrigger<T extends LocalMicrocompactMessage>(
  request: MicrocompactPassRequest<T>,
  estimated: number,
  threshold: number | undefined,
  defaults: MicrocompactRuntimeDefaults,
): MicrocompactTrigger | undefined {
  const idleMinutes =
    floorIfUsable(request.config?.idleThresholdMinutes) ?? defaults.idleThresholdMinutes;
  const finishedAt = request.lastAssistantCompletedAtMs;
  if (finishedAt !== undefined && Number.isFinite(finishedAt)) {
    const reference = request.nowMs ?? Date.now();
    if (reference - finishedAt > idleMinutes * MINUTE_IN_MILLISECONDS) {
      return MicrocompactTrigger.TimeBased;
    }
  }
  if (threshold !== undefined && estimated >= threshold) {
    return MicrocompactTrigger.TokenPressure;
  }
  return undefined;
}

/**
 * 以助手工具回合为分界，把可清理的旧工具结果切成若干组。
 * 分界之前的散落结果各自独立成组（沿用既有边界行为），分界之后的结果按顺序并在同一组。
 */
function collectClearableRuns<T extends LocalMicrocompactMessage>(
  messages: readonly T[],
  policy: LocalMicrocompactPolicyConfig,
  defaults: MicrocompactRuntimeDefaults,
): ClearableSlot[][] {
  const allowedTools = new Set(policy.compactableToolNames ?? defaults.compactableTools);
  const keepErrorResults = policy.clearErrorResults === true;
  const runs: ClearableSlot[][] = [];
  let openRun: ClearableSlot[] | undefined;
  const closeRun = (): void => {
    if (openRun !== undefined && openRun.length > 0) runs.push(openRun);
    openRun = undefined;
  };

  messages.forEach((message, at) => {
    if (startsAssistantToolRound(message)) {
      closeRun();
      openRun = [];
      return;
    }
    const slot = clearableSlot(message, at, allowedTools, keepErrorResults, defaults.clearedText);
    if (slot === undefined) return;
    if (openRun === undefined) {
      runs.push([slot]);
      return;
    }
    openRun.push(slot);
  });

  closeRun();
  return runs;
}

/** 助手回合分界：带工具调用的助手消息。 */
function startsAssistantToolRound(message: LocalMicrocompactMessage): boolean {
  if (message.role !== "assistant") return false;
  const calls = message.toolCalls;
  return calls !== undefined && calls.length > 0;
}

/** 单条工具结果能否被清理；被保护媒体、已清理内容与错误结果按策略跳过。 */
function clearableSlot(
  message: LocalMicrocompactMessage,
  at: number,
  allowedTools: ReadonlySet<string>,
  keepErrorResults: boolean,
  clearedText: string,
): ClearableSlot | undefined {
  if (message.role !== "tool") return undefined;
  const callId = message.toolCallId;
  const toolName = message.toolName;
  if (!callId || !toolName) return undefined;
  if (!allowedTools.has(toolName)) return undefined;
  if (message.isError && !keepErrorResults) return undefined;
  if (modelMessageContentToText(message.content) === clearedText) return undefined;
  if (holdsProtectedMedia(message.content)) return undefined;
  const slot: ClearableSlot = { at, callId };
  return slot;
}

/** 含图片、视频或文件块的结果受保护：清掉它们会丢模型可见的媒体引用。 */
function holdsProtectedMedia(content: ModelMessageContent): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((piece) => isProtectedMediaPiece(piece));
}

function isProtectedMediaPiece(piece: ModelMessageContentBlock): boolean {
  switch (piece.type) {
    case "image":
    case "video":
    case "file":
      return true;
    default:
      return false;
  }
}

/** 把分组摊平成一个顺序槽位列表（保持原始消息顺序）。 */
function flattenRuns(runs: readonly ClearableSlot[][]): ClearableSlot[] {
  const flat: ClearableSlot[] = [];
  for (const run of runs) {
    for (const slot of run) flat.push(slot);
  }
  return flat;
}

/** 决策对象逐字段赋值，避免把可选 trigger 写成固定键。 */
function describeDecision(
  estimatedTokenCount: number,
  reason: LocalMicrocompactDecision["reason"],
  thresholdTokens: number | undefined,
  trigger?: MicrocompactTrigger,
): LocalMicrocompactDecision {
  const decision = {} as LocalMicrocompactDecision;
  decision.estimatedTokenCount = estimatedTokenCount;
  decision.reason = reason;
  decision.thresholdTokens = thresholdTokens;
  if (trigger !== undefined) decision.trigger = trigger;
  return decision;
}

/** 结果对象逐字段赋值；没有载荷时不留 payload 键。 */
function wrapResult<T extends LocalMicrocompactMessage>(
  messages: T[],
  decision: LocalMicrocompactDecision,
  payload?: LocalMicrocompactBoundaryPayload,
): LocalMicrocompactResult<T> {
  const result = {} as LocalMicrocompactResult<T>;
  result.decision = decision;
  result.messages = messages;
  if (payload !== undefined) result.payload = payload;
  return result;
}

/** 边界载荷：被清掉与保留下来的工具调用 id 都按原始顺序记录。 */
function buildBoundaryPayload(
  before: number,
  after: number,
  saved: number,
  dropped: readonly ClearableSlot[],
  retained: readonly ClearableSlot[],
  trigger: MicrocompactTrigger,
): LocalMicrocompactBoundaryPayload {
  const payload = {} as LocalMicrocompactBoundaryPayload;
  payload.clearedMessageCount = dropped.length;
  payload.clearedToolCallIds = dropped.map(toToolCallId);
  payload.keptToolCallIds = retained.map(toToolCallId);
  payload.postMicrocompactTokenCount = after;
  payload.preMicrocompactTokenCount = before;
  payload.strategy = MicrocompactStrategy.LocalToolResultClear;
  payload.tokensSaved = saved;
  payload.trigger = trigger;
  return payload;
}

function toToolCallId(slot: ClearableSlot): ToolCallId {
  return slot.callId as ToolCallId;
}

/** 负数、非数与缺省都视作「未配置」。 */
function floorIfUsable(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

/** 消息副本：内容块按需深一层复制（source / providerOptions），工具调用逐个复制。 */
function copyMicrocompactMessage<T extends LocalMicrocompactMessage>(message: T): T {
  const copy = { ...message } as T;
  copy.content = copyModelMessageContent(message.content);
  const calls = message.toolCalls;
  if (calls !== undefined) copy.toolCalls = calls.map((call) => ({ ...call }));
  return copy;
}

function copyModelMessageContent(content: ModelMessageContent): ModelMessageContent {
  if (typeof content === "string") return content;
  return content.map((piece) => copyContentPiece(piece));
}

function copyContentPiece(piece: ModelMessageContentBlock): ModelMessageContentBlock {
  if ("source" in piece && piece.source) {
    const withSource = { ...piece };
    withSource.source = { ...piece.source };
    return withSource;
  }
  if ("providerOptions" in piece && piece.providerOptions) {
    const withOptions = { ...piece };
    withOptions.providerOptions = { ...piece.providerOptions };
    return withOptions;
  }
  return { ...piece };
}
