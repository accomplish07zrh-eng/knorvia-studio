// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的桩替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-01");
};

const _unimplementedValue = (): never => notImplemented();

export type BaseHookInput = never;
export type CanonicalWorkspaceHookEntry = never;
export const canonicalWorkspaceHookEntrySchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export function createWorkspaceHookBundleSnapshot(..._args: unknown[]): never {
  return notImplemented();
}
export const DefaultHooksRuntimeConfig = new Proxy({} as never, { get: _unimplementedValue });
export type HookCommandConfig = never;
export const HookCommandConfigSchema = new Proxy({} as never, { get: _unimplementedValue });
export type HookConfig = never;
export const HookConfigSchema = new Proxy({} as never, { get: _unimplementedValue });
export type HookConfigSource = never;
export type HookEventName = never;
export type HookExecutionDescriptor = never;
export type HookInput = never;
export type HookJSONOutput = never;
export const HookJSONOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type HookMatcherConfig = never;
export const HookMatcherConfigSchema = new Proxy({} as never, { get: _unimplementedValue });
export type HookOutcome = never;
export type HookPermissionDecision = never;
export type HookPluginContext = never;
export type HookProcessConfig = never;
export const HookProcessConfigSchema = new Proxy({} as never, { get: _unimplementedValue });
export type HookRunLifecyclePayload = never;
export type HookSourceKind = never;
export type HookSpecificOutput = never;
export const HookSpecificOutputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type HooksRuntimeConfig = never;
export type HooksRuntimeConfigPatch = never;
export const HooksRuntimeConfigPatchSchema = new Proxy({} as never, { get: _unimplementedValue });
export type PermissionRequestHookDecision = never;
export type PermissionRequestHookInput = never;
export type PostToolUseFailureHookInput = never;
export type PostToolUseHookInput = never;
export type PreToolUseHookInput = never;
export type SessionStartHookInput = never;
export type StopHookInput = never;
export type UserPromptSubmitHookInput = never;
export const WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKSPACE_HOOK_REVIEW_TIMEOUT_MS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKSPACE_HOOK_SCHEMA_FIELDS = new Proxy({} as never, { get: _unimplementedValue });
export const WORKSPACE_HOOK_STATE_ADMISSION_MAP = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkspaceHookAdmissionClass = never;
export const workspaceHookAdmissionClassSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkspaceHookBundleSnapshot = never;
export const workspaceHookBundleSnapshotSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkspaceHookEffectiveState = never;
export const workspaceHookEffectiveStateSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const workspaceHookEventNameSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkspaceHookPolicy = never;
export const workspaceHookPolicySchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkspaceHookReasonCode = never;
export const workspaceHookReasonCodeSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkspaceHookReviewFlowState = never;
export const workspaceHookReviewFlowStateSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkspaceHookSecurityRevision = never;
export const workspaceHookSecurityRevisionSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkspaceHookTrustRecord = never;
export const workspaceHookTrustRecordSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkspaceHookTrustState = never;
export const workspaceHookTrustStateSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkspaceHookTrustStoreFile = never;
export const workspaceHookTrustStoreFileSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
