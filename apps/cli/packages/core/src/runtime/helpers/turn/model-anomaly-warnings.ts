// SPDX-License-Identifier: Apache-2.0
// 模型异常的重复调用与预算提醒（B31）。
// 签名按「工具名 + 输入的稳定序列化（键排序）」计算；连续命中达到阈值（默认 3）给一条观察；
// 预算告警在「本轮工具调用数首次跨过阈值」时给一条；两者共享注入上限（默认 3 次），超限后
// 观察仍返回但 warningInjected 为 false。阈值 ≤0 或未配置不产生观察，不抛异常。
// 观察状态由调用方持有并**原地更新**（累计状态机，不幂等是期望语义）；提醒正文为固定句式。
import type { ModelAnomalyGuardConfig, ModelToolCall, ToolCallId } from "../../deps.js";

// 阈值与注入上限的默认值（行为契约）。
const DEFAULT_REPEAT_THRESHOLD = 3;
const DEFAULT_MAX_INJECTED_WARNINGS = 3;

export interface RepeatedToolCallWarningState {
  anomalyWarningsInjected: /* 本回合已注入的提醒数 */ number;
  repeatedToolCallSignature?: /* 当前连续签名 */ string;
  repeatedToolCallStreakCount: /* 当前连续次数 */ number;
}

export interface RepeatedToolCallWarningObservation {
  observedCount: /* 命中时的连续次数 */ number;
  threshold: /* 告警阈值 */ number;
  toolCallId: /* 命中的工具调用 id */ ToolCallId;
  toolName: /* 工具名 */ string;
  warningInjected: /* 是否真的注入了提醒 */ boolean;
}

export interface ToolCallBudgetWarningObservation {
  observedCount: /* 本轮工具调用数 */ number;
  threshold: /* 告警阈值 */ number;
  warningInjected: /* 是否真的注入了提醒 */ boolean;
}

// 重复调用提醒正文的三句（逐字契约）：首句带工具名与次数。
const REPEAT_HEAD_PREFIX = "You have called ";
const REPEAT_HEAD_SUFFIX = " times in a row.";
const REPEAT_RETRY_GUARD =
  "Do not repeat the exact same tool call again unless the user explicitly asked you to retry it unchanged.";
const REPEAT_NEXT_STEP =
  "Use the existing result to take a different next step, explain the blocker, or ask the user for guidance.";

// 预算提醒正文的两句（逐字契约）：首句带本轮调用数。
const BUDGET_HEAD_PREFIX = "This turn has already made ";
const BUDGET_HEAD_SUFFIX = " tool calls.";
const BUDGET_NEXT_STEP =
  "Do not keep calling tools reflexively. Use the gathered results to choose a different next step, summarize the blocker, or ask the user for guidance if you are stuck.";

// 稳定序列化：对象按键排序递归展开，数组保序；字面量走 JSON.stringify。
function stableJson(node: unknown): string {
  if (Array.isArray(node)) {
    return `[${node.map((item) => stableJson(item)).join(",")}]`;
  }
  if (node && typeof node === "object") {
    const fields = node as Record<string, unknown>;
    const pairs = Object.keys(fields)
      .sort() // 键排序是签名稳定性的来源
      .map((key) => `${JSON.stringify(key)}:${stableJson(fields[key])}`);
    return `{${pairs.join(",")}}`;
  }
  return JSON.stringify(node) ?? "undefined";
}

// 调用签名：工具名 + 稳定序列化的输入。
const toolCallSignature = (toolName: string, input: unknown): string =>
  `${JSON.stringify(toolName)}:${stableJson(input)}`;

// 注入额度记账：还有额度就注入并计数，超限只标记不再注入。
function claimInjectionSlot(watch: RepeatedToolCallWarningState, maxWarnings: number): boolean {
  const allowed = watch.anomalyWarningsInjected < maxWarnings;
  if (allowed) {
    watch.anomalyWarningsInjected += 1;
  }
  return allowed;
}

export function detectRepeatedToolCallWarnings(
  calls: readonly ModelToolCall[],
  watch: RepeatedToolCallWarningState,
  guard: Partial<ModelAnomalyGuardConfig> | undefined,
): RepeatedToolCallWarningObservation[] {
  const limit = guard?.repeatedToolCallWarningThreshold ?? DEFAULT_REPEAT_THRESHOLD;
  const maxWarnings = guard?.maxBudgetWarningsPerTurn ?? DEFAULT_MAX_INJECTED_WARNINGS;
  if (limit <= 0) {
    return [];
  }

  const findings: RepeatedToolCallWarningObservation[] = [];
  for (const call of calls) {
    const signature = toolCallSignature(call.name, call.input);
    if (watch.repeatedToolCallSignature === signature) {
      watch.repeatedToolCallStreakCount += 1;
    } else {
      watch.repeatedToolCallSignature = signature;
      watch.repeatedToolCallStreakCount = 1;
    }
    // 只在「正好压线」的那一次产出观察，之后的重复不再重复报。
    if (watch.repeatedToolCallStreakCount === limit) {
      const injected = claimInjectionSlot(watch, maxWarnings);
      findings.push({
        observedCount: watch.repeatedToolCallStreakCount,
        threshold: limit,
        toolCallId: call.id as ToolCallId,
        toolName: call.name,
        warningInjected: injected,
      });
    }
  }
  return findings;
}

export function detectToolCallBudgetWarning(
  currentToolCallCount: number,
  newToolCallCount: number,
  watch: RepeatedToolCallWarningState,
  guard: Partial<ModelAnomalyGuardConfig> | undefined,
): ToolCallBudgetWarningObservation | undefined {
  const limit = guard?.toolCallWarningThreshold;
  if (limit === undefined || limit <= 0) {
    return undefined;
  }
  // 首次跨线才告警：之前已达阈值或本轮还没到都不告。
  const previousToolCallCount = currentToolCallCount - newToolCallCount;
  const crossedNow = previousToolCallCount < limit && currentToolCallCount >= limit;
  if (!crossedNow) {
    return undefined;
  }

  const maxWarnings = guard?.maxBudgetWarningsPerTurn ?? DEFAULT_MAX_INJECTED_WARNINGS;
  const injected = claimInjectionSlot(watch, maxWarnings);
  return {
    observedCount: currentToolCallCount,
    threshold: limit,
    warningInjected: injected,
  };
}

// 重复调用提醒正文（逐字契约）：三句固定句式，首句带工具名与次数。
export const buildRepeatedToolCallReminderBody = (
  toolName: string,
  observedCount: number,
): string =>
  [
    `${REPEAT_HEAD_PREFIX}${toolName} with the same input ${observedCount}${REPEAT_HEAD_SUFFIX}`,
    REPEAT_RETRY_GUARD,
    REPEAT_NEXT_STEP,
  ].join("\n");

// 预算提醒正文（逐字契约）：两句固定句式，首句带本轮调用数。
export const buildToolCallBudgetReminderBody = (observedCount: number): string =>
  [`${BUDGET_HEAD_PREFIX}${observedCount}${BUDGET_HEAD_SUFFIX}`, BUDGET_NEXT_STEP].join("\n");
