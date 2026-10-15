// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export interface ClassifiedModelFailure {
  code: ModelErrorCodeType;
  message: string;
  reason: ModelFailureReason;
  retryReason: ModelRetryReason;
  retryable: boolean;
  retryAfterMs?: number;
  statusCode?: number;
}
export function findProviderBusinessError(
  error: unknown,
  seen = new WeakSet<object>(),
): ProviderBusinessError | undefined {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function inspectProviderFailure(error: unknown): ProviderFailureDetails {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function classifyModelFailure(
  error: unknown,
  abortSignal?: AbortSignal,
): ClassifiedModelFailure {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function isRetryableFailure(failure: ClassifiedModelFailure): boolean {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
