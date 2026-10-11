// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的桩替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-01");
};

const _unimplementedValue = (): never => notImplemented();

export function annotateBoundaryWithPreservedSegment(..._args: unknown[]): never {
  return notImplemented();
}
export function buildPostCompactItems(..._args: unknown[]): never {
  return notImplemented();
}
export type CompactBoundaryPayload = never;
export const compactBoundaryPayloadSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CompactContextItem = never;
export type CompactFailureReason = never;
export type CompactPhase = never;
export type CompactPostContext = never;
export type CompactPreservedSegment = never;
export const compactPreservedSegmentSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CompactProjectionInfo = never;
export type CompactReason = never;
export type CompactStatus = never;
export type CompactSummaryPayload = never;
export type CompactTimelineDisplay = never;
export type CompactTimelinePayload = never;
export const compactTimelinePayloadSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CompactTimelineStatus = never;
export type CompactTrigger = never;
export function getItemsAfterLastCompactBoundary(..._args: unknown[]): never {
  return notImplemented();
}
export function isCompactBoundaryItem(..._args: unknown[]): never {
  return notImplemented();
}
export type MicrocompactBoundaryPayload = never;
export const microcompactBoundaryPayloadSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type MicrocompactStrategy = never;
export type MicrocompactTrigger = never;
export function parseCompactBoundaryPayload(..._args: unknown[]): never {
  return notImplemented();
}
export function parseCompactTimelinePayload(..._args: unknown[]): never {
  return notImplemented();
}
export function parseMicrocompactBoundaryPayload(..._args: unknown[]): never {
  return notImplemented();
}
