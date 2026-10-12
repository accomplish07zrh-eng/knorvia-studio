// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-02 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-02");
};

const _unimplementedValue = (): never => notImplemented();

export function createChildTraceContext(..._args: unknown[]): never {
  return notImplemented();
}
export function createRootTraceContext(..._args: unknown[]): never {
  return notImplemented();
}
export function createSpan(..._args: unknown[]): never {
  return notImplemented();
}
export function createTracer(..._args: unknown[]): never {
  return notImplemented();
}
export type ExecutionContext = never;
export function getCurrentTraceContext(..._args: unknown[]): never {
  return notImplemented();
}
export function runWithContext(..._args: unknown[]): never {
  return notImplemented();
}
export function runWithContextAsync(..._args: unknown[]): never {
  return notImplemented();
}
export type Span = never;
export type TraceContext = never;
export function traceContextToLogContext(..._args: unknown[]): never {
  return notImplemented();
}
export type Tracer = never;
