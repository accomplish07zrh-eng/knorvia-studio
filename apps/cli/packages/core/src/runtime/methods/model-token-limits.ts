// SPDX-License-Identifier: Apache-2.0
// 模型请求输出预算入口：两级口径的实算在 support/token-budget.ts，这里保持兼容导出面。
import type { TraceContext } from "../deps.js";
import {
  declaredOutputBudget,
  stepCapAgainstWindow,
  tokenLimitLogFields,
} from "./support/token-budget.js";

export function resolveNormalRequestMaxOutputTokens(input: {
  modelMaxOutputTokens: number | undefined;
}): number /* 一级：声明值或默认档 */ {
  return declaredOutputBudget({ modelMaxOutputTokens: input.modelMaxOutputTokens });
}

export function resolveModelStepMaxOutputTokens(input: {
  baselineMaxOutputTokens: number;
  contextWindow: number | undefined;
  estimatedCurrentUsage: number;
  modelContextBudgetStrategy: "legacy" | "preflight-v1" | undefined;
}): number /* 二级：窗口收紧后的上限 */ {
  return stepCapAgainstWindow(input);
}

export function modelRequestTokenLimitLogContext(input: {
  contextWindow: number | undefined;
  maxOutputTokens: number | undefined;
  modelContextBudgetStrategy: "legacy" | "preflight-v1" | undefined;
  traceContext: TraceContext;
}) /* 限额日志上下文 */ {
  return tokenLimitLogFields(input);
}
