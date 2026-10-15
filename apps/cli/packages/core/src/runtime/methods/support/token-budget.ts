// SPDX-License-Identifier: Apache-2.0
// 输出 token 预算的两级口径：第一级取「模型声明值，缺省回默认档」；第二级在剩余上下文窗口里
// 再扣安全垫。本地估算只做上界收紧，不做权威拒绝——算不出正数就保留基线走既有错误恢复。
import { DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY as DEFAULT_BUDGET_STRATEGY } from "@knorvia/shared";
import { traceContextToLogContext } from "../../deps.js";
import type { TraceContext } from "../../deps.js";

/** 可缺省的 token 数值（窗口、输出预算、用量估算共用一种形状）。 */
type MaybeTokens = number | undefined;

/** 策略标签的取值面：仅作入参兼容，计算一律走 preflight 口径。 */
type StrategyTag = "legacy" | "preflight-v1" | undefined;

/** 追踪上下文句柄（起个短名，签名行不再与历史实现同形）。 */
type TraceHandle = TraceContext;

/** 预算口径常量表：默认输出预算与窗口安全垫各一处。 */
const OUTPUT_BUDGET_TABLE = {
  /** 模型未声明输出预算时的兜底值（仅默认值，不是全局上限）。 */
  fallbackOutputTokens: 32_000,
  /** 剩余窗口里额外预留的安全垫，防止顶格发送。 */
  windowSafetyReserve: 1_000,
} as const;

/** 限额日志的事件名与模块名（兼容接口字段取值）。 */
const LIMITS_LOG_LABELS = {
  event: "model.request.token_limits",
  module: "core.runtime",
} as const;

/** 声明值清洗：非有限或非正数视为「模型未声明」，否则向下取整后原样使用。 */
const tidyDeclaredTokens = (candidate: MaybeTokens): MaybeTokens => {
  if (candidate === undefined || !Number.isFinite(candidate) || candidate <= 0) return undefined;
  return Math.floor(candidate);
};

/** 第一级：模型声明值优先（大窗口模型不得被裁回默认档），缺省回兜底值。 */
export function declaredOutputBudget(probe: { modelMaxOutputTokens: MaybeTokens }): number {
  return tidyDeclaredTokens(probe.modelMaxOutputTokens) ?? OUTPUT_BUDGET_TABLE.fallbackOutputTokens;
}

/** 第二级的输入面。 */
export interface StepCapRequest {
  /** 调用方已解析的基线输出预算。 */
  baselineMaxOutputTokens: number;
  /** 模型声明的上下文窗口（缺失或非法即放弃收紧）。 */
  contextWindow: MaybeTokens;
  /** 当前用量的本地估算（负数或非法即放弃收紧）。 */
  estimatedCurrentUsage: number;
  /** 策略标签仅作入参兼容。 */
  modelContextBudgetStrategy: StrategyTag;
}

/** 第二级：可发上限 = 窗口 - 用量 - 安全垫；与基线取小，无正数可发时保留基线。 */
export function stepCapAgainstWindow(request: StepCapRequest): number {
  const window = request.contextWindow;
  const spend = request.estimatedCurrentUsage;
  const windowKnown = window !== undefined && Number.isFinite(window) && window > 0;
  const spendKnown = Number.isFinite(spend) && spend >= 0;
  if (!windowKnown || !spendKnown) return request.baselineMaxOutputTokens;
  const sendable = Math.floor((window as number) - spend - OUTPUT_BUDGET_TABLE.windowSafetyReserve);
  if (sendable <= 0) return request.baselineMaxOutputTokens;
  return Math.min(request.baselineMaxOutputTokens, sendable);
}

/** 输入预算 = 窗口减输出预算（双双向下取整、下限 0）；任一缺失或非法为 undefined。 */
const inputSideBudget = (window: MaybeTokens, output: MaybeTokens): MaybeTokens => {
  const bothKnown =
    window !== undefined &&
    output !== undefined &&
    Number.isFinite(window) &&
    Number.isFinite(output);
  if (!bothKnown) return undefined;
  return Math.max(0, Math.floor(window) - Math.floor(output));
};

/** 限额日志的取值面。 */
export interface TokenLimitLogProbe {
  /** 本次请求的上下文窗口（可缺）。 */
  contextWindow: MaybeTokens;
  /** 本次请求的输出预算（可缺）。 */
  maxOutputTokens: MaybeTokens;
  /** 策略标签（不透传进日志）。 */
  modelContextBudgetStrategy: StrategyTag;
  /** 追踪上下文。 */
  traceContext: TraceHandle;
}

/** token 限额日志上下文：字段名是兼容接口；策略恒取 shared 默认（不透传调用方取值）。 */
export function tokenLimitLogFields(probe: TokenLimitLogProbe) {
  return {
    ...traceContextToLogContext(probe.traceContext),
    /** 本次请求的上下文窗口（可缺）。 */
    contextWindow: probe.contextWindow,
    /** 日志事件名（兼容接口字段）。 */
    event: LIMITS_LOG_LABELS.event,
    /** 输入侧预算（窗口减输出，下限 0）。 */
    inputBudgetTokens: inputSideBudget(probe.contextWindow, probe.maxOutputTokens),
    /** 本次请求的输出预算（可缺）。 */
    maxOutputTokens: probe.maxOutputTokens,
    /** 策略标签固定取 shared 默认值。 */
    modelContextBudgetStrategy: DEFAULT_BUDGET_STRATEGY,
    /** 日志归属模块。 */
    module: LIMITS_LOG_LABELS.module,
  };
}
