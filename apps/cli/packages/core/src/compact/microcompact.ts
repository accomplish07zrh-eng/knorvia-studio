// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// microcompact 的公开面：冻结的阈值常量、兼容类型与两个导出函数。判定与改写都在
// ./microcompact-internal.js；本模块只把公开默认值与调用请求接在一起。
import type { MicrocompactBoundaryPayload, MicrocompactTrigger } from "@knorvia/contracts";
import type { CompactModelMessage } from "./manual.js";
import {
  applyMicrocompactPass,
  buildMicrocompactThreshold,
  type MicrocompactRuntimeDefaults,
} from "./microcompact-internal.js";

export const MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX = "[Old tool result content cleared]";
export const MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE = "[Old tool result content cleared]";
export const DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS = 5;
export const DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS = 256;
export const DEFAULT_MICROCOMPACT_THRESHOLD_RATIO = 0.9;
export const DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS = 2000;
export const DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS = [
  "Read",
  "Bash",
  "Grep",
  "Glob",
  "WebFetch",
  "WebSearch",
  "Edit",
  "Write",
  "ApplyPatch",
] as const;

export interface LocalMicrocompactPolicyConfig {
  enabled?: boolean;
  thresholdTokens?: number;
  idleThresholdMinutes?: number;
  keepRecentToolResults?: number;
  compactableToolNames?: readonly string[];
  clearErrorResults?: boolean;
  minTokenSavings?: number;
}

export interface LocalMicrocompactMessage extends CompactModelMessage {
  isError?: boolean;
  toolCalls?: Array<{
    id: string;
    input: unknown;
    name: string;
  }>;
  toolCallId?: string;
  toolName?: string;
}

export type LocalMicrocompactBoundaryPayload = Omit<
  MicrocompactBoundaryPayload,
  "traceId" | "turnId"
>;

export interface LocalMicrocompactDecision {
  estimatedTokenCount: number;
  reason:
    | "disabled"
    | "not_triggered"
    | "no_candidates"
    | "nothing_to_clear"
    | "below_min_savings"
    | "applied";
  thresholdTokens?: number;
  trigger?: MicrocompactTrigger;
}

export interface LocalMicrocompactResult<T extends LocalMicrocompactMessage> {
  decision: LocalMicrocompactDecision;
  messages: T[];
  payload?: LocalMicrocompactBoundaryPayload;
}

/** 未配置空闲阈值时的缺省分钟数（空闲触发判定用）。 */
const IDLE_THRESHOLD_MINUTES_FALLBACK = 60;

/** 公开默认值的唯一一份装配；内部模块只读这里传进去的值。 */
const PUBLIC_RUNTIME_DEFAULTS: MicrocompactRuntimeDefaults = {
  clearedText: MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE,
  compactableTools: DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS,
  idleThresholdMinutes: IDLE_THRESHOLD_MINUTES_FALLBACK,
  keepRecentToolResults: DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS,
  minTokenSavings: DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS,
  thresholdBufferTokens: DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS,
  thresholdRatio: DEFAULT_MICROCOMPACT_THRESHOLD_RATIO,
};

/** 比例上限与缓冲余量取小、下界 0；调用方给的自动压缩阈值不变。 */
export function buildDefaultMicrocompactThreshold(autoCompactThreshold: number): number {
  return buildMicrocompactThreshold(autoCompactThreshold, PUBLIC_RUNTIME_DEFAULTS);
}

/** 本地微压缩入口：判定触发、按要求保留最近若干组工具结果、清掉更早的那些。 */
export function maybeLocalMicrocompactMessages<T extends LocalMicrocompactMessage>(input: {
  config?: LocalMicrocompactPolicyConfig; // 策略覆盖：开关、token 阈值、空闲分钟、保留组数、工具白名单、错误结果与最小节省
  lastAssistantCompletedAtMs?: number; // 上一回合助手的完成时刻，用于空闲触发判定
  messages: readonly T[]; // 待判定的消息；返回的是副本，原数组不会被改写
  nowMs?: number; // 判定用的当前时刻，缺省取系统时间
}): LocalMicrocompactResult<T> {
  return applyMicrocompactPass(input, PUBLIC_RUNTIME_DEFAULTS);
}
