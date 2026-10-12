// SPDX-License-Identifier: Apache-2.0
// core-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: core-01");
};

const _unimplementedValue = (): never => notImplemented();
export const MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const DEFAULT_MICROCOMPACT_THRESHOLD_RATIO = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type LocalMicrocompactPolicyConfig = never;
export type LocalMicrocompactMessage = never;
export type LocalMicrocompactBoundaryPayload = never;
export type LocalMicrocompactDecision = never;
export type LocalMicrocompactResult = never;
export function buildDefaultMicrocompactThreshold(..._args: unknown[]): never {
  return notImplemented();
}
export function maybeLocalMicrocompactMessages(..._args: unknown[]): never {
  return notImplemented();
}
