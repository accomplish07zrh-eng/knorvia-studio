// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-02 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-02");
};

const _unimplementedValue = (): never => notImplemented();

export type ActiveConversationBranchOptions = never;
export type CheckpointCreatedPayload = never;
export const checkpointCreatedPayloadSchema = new Proxy({} as never, { get: _unimplementedValue });
export type CheckpointProjectionInfo = never;
export function evaluateRewindTarget(..._args: unknown[]): never {
  return notImplemented();
}
export type EvaluateRewindTargetInput = never;
export function parseCheckpointCreatedPayload(..._args: unknown[]): never {
  return notImplemented();
}
export function parseRewindTriggeredPayload(..._args: unknown[]): never {
  return notImplemented();
}
export function parseWorkspaceCheckpointArtifact(..._args: unknown[]): never {
  return notImplemented();
}
export type RewindProjectionInfo = never;
export type RewindScope = never;
export type RewindStrategy = never;
export type RewindTargetEvaluation = never;
export type RewindTargetStatus = never;
export type RewindTriggeredPayload = never;
export const rewindTriggeredPayloadSchema = new Proxy({} as never, { get: _unimplementedValue });
export function selectActiveConversationBranch(..._args: unknown[]): never {
  return notImplemented();
}
export type WorkspaceCheckpointArtifact = never;
export const workspaceCheckpointArtifactSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
