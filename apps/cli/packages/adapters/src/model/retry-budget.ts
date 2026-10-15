// SPDX-License-Identifier: Apache-2.0
// 重试预算裁决：workflow 无界预算永远放行、对外换算的最大尝试数记 0；
// 有界预算按「已用次数 < 上限」放行、循环按「当前轮次 ≤ 上限」继续。
// UNBOUNDED_RETRY_MAX_ATTEMPTS 的 0 是对外换算口径，不是无穷大。

import { ModelRetryBudget } from "@knorvia/contracts";

export const UNBOUNDED_RETRY_MAX_ATTEMPTS = 0;

type Scope = ModelRetryBudget | undefined;
type BudgetShape = "unbounded" | "bounded";

function shapeOf(scope: Scope): BudgetShape {
  return scope === ModelRetryBudget.Unbounded ? "unbounded" : "bounded";
}

export function isUnboundedRetryBudget(scope: Scope): boolean {
  return shapeOf(scope) === "unbounded";
}

export function retryBudgetAllows(scope: Scope, used: number, ceiling: number): boolean {
  if (shapeOf(scope) === "unbounded") return true;
  return used < ceiling;
}

export function retryAttemptLoopContinues(scope: Scope, round: number, ceiling: number): boolean {
  if (shapeOf(scope) === "unbounded") return true;
  return round <= ceiling;
}

export function retryBudgetMaxAttempts(scope: Scope, ceiling: number): number {
  return shapeOf(scope) === "unbounded" ? UNBOUNDED_RETRY_MAX_ATTEMPTS : ceiling;
}
