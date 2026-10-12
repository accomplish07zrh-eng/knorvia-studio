// SPDX-License-Identifier: Apache-2.0
// core-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: core-01");
};

const _unimplementedValue = (): never => notImplemented();
export const DEFAULT_COMPACT_CONTEXT_WINDOW = new Proxy({} as never, { get: _unimplementedValue });
export const DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const MAX_OUTPUT_TOKENS_FOR_SUMMARY = new Proxy({} as never, { get: _unimplementedValue });
export const AUTOCOMPACT_BUFFER_TOKENS = new Proxy({} as never, { get: _unimplementedValue });
export const DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type AutoCompactPolicyConfig = never;
export type AutoCompactTokenSource = never;
export type AutoCompactTokenOverride = never;
export type AutoCompactDecision = never;
export function getEffectiveContextWindowSize(..._args: unknown[]): never {
  return notImplemented();
}
export function getAutoCompactOutputReserveTokens(..._args: unknown[]): never {
  return notImplemented();
}
export function getAutoCompactThreshold(..._args: unknown[]): never {
  return notImplemented();
}
export function shouldAutoCompact(..._args: unknown[]): never {
  return notImplemented();
}
