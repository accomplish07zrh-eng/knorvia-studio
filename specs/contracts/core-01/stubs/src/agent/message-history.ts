// SPDX-License-Identifier: Apache-2.0
// core-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: core-01");
};

const _unimplementedValue = (): never => notImplemented();
export type ToolCallInput = never;
export type ReasoningContentInput = never;
export type ModelInputMessage = never;
export type RuntimeMessageSource = never;
export type RuntimeMessageMetadata = never;
export type RuntimeMessageMessageEntry = never;
export type RuntimeAttachmentEntry = never;
export type RuntimeMessageEntry = never;
export type CacheStats = never;
export type MessageHistory = never;
export function systemReminderRuntimeMetadata(..._args: unknown[]): never {
  return notImplemented();
}
export function realUserRuntimeMetadata(..._args: unknown[]): never {
  return notImplemented();
}
export function legacySyntheticRuntimeMetadata(..._args: unknown[]): never {
  return notImplemented();
}
export function todoReminderRuntimeMetadata(..._args: unknown[]): never {
  return notImplemented();
}
export function isKnownSystemReminderSource(..._args: unknown[]): never {
  return notImplemented();
}
export function isRuntimeAttachmentEntry(..._args: unknown[]): never {
  return notImplemented();
}
export function systemReminderAttachmentEntry(..._args: unknown[]): never {
  return notImplemented();
}
export function createRuntimeUserEntry(..._args: unknown[]): never {
  return notImplemented();
}
export function createRuntimeAssistantEntry(..._args: unknown[]): never {
  return notImplemented();
}
export function createRuntimeToolResultEntry(..._args: unknown[]): never {
  return notImplemented();
}
export function cloneModelMessageContent(..._args: unknown[]): never {
  return notImplemented();
}
export function cloneModelInputMessage(..._args: unknown[]): never {
  return notImplemented();
}
export function cloneRuntimeMessageEntry(..._args: unknown[]): never {
  return notImplemented();
}
export function countContextPrefixMessages(..._args: unknown[]): never {
  return notImplemented();
}
export function invalidateRuntimeTokenUsage(..._args: unknown[]): never {
  return notImplemented();
}
export type MessageHistoryImpl = never;
export function createMessageHistory(..._args: unknown[]): never {
  return notImplemented();
}
