// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export const UNBOUNDED_RETRY_MAX_ATTEMPTS: 0 = undefined as never;
export function isUnboundedRetryBudget(budget: ModelRetryBudget | undefined): boolean {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function retryBudgetAllows(
  budget: ModelRetryBudget | undefined,
  retryBudgetAttempt: number,
  maxAttempts: number,
): boolean {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function retryAttemptLoopContinues(
  budget: ModelRetryBudget | undefined,
  attempt: number,
  loopMaxAttempts: number,
): boolean {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function retryBudgetMaxAttempts(
  budget: ModelRetryBudget | undefined,
  maxAttempts: number,
): number {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
