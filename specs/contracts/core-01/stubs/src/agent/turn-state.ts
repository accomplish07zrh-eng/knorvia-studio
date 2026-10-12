// SPDX-License-Identifier: Apache-2.0
// core-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: core-01");
};

const _unimplementedValue = (): never => notImplemented();
export const ToolCall = new Proxy({} as never, { get: _unimplementedValue });
export const TurnPhase = new Proxy({} as never, { get: _unimplementedValue });
export type TurnPhase = never;
export type TurnState = never;
export type ModelRequestState = never;
export type ModelMessage = never;
export type TokenUsageState = never;
export type ToolCallState = never;
export type ToolCallStateStatus = never;
export type ToolResultState = never;
export type ToolScheduleState = never;
export type ToolScheduleItem = never;
export type PermissionRequestState = never;
export type PermissionResultState = never;
export type PermissionDecision = never;
export type TurnResultType = never;
export type TurnErrorState = never;
export type TurnAttachment = never;
export function createTurnState(..._args: unknown[]): never {
  return notImplemented();
}
export function isTerminalPhase(..._args: unknown[]): never {
  return notImplemented();
}
export function isWaitingPhase(..._args: unknown[]): never {
  return notImplemented();
}
export function canTransitionTo(..._args: unknown[]): never {
  return notImplemented();
}
