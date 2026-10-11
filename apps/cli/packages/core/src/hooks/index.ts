// SPDX-License-Identifier: Apache-2.0
// core/hooks 的公开入口：稳定对外面（interface.md 的 44 个导出）。
// 保留的已独立候选文件（runner*、output*）不从这里之外的路径被外部依赖；
// 内部实现的模块划分可自由调整，但本文件的导出名与签名不可变。
export { createConfiguredHookRunner } from "./configured-runner.js";
export { createHookExecutionDescriptor, sanitizeHookDisplayText } from "./display-metadata.js";
export { InMemoryHookRunner, createInMemoryHookRunner } from "./runner.js";
export { createSessionMailboxHookRegistrations } from "./session-mailbox.js";
export type {
  ConfiguredHookRunnerOptions,
  HookCallback,
  HookCallbackContext,
  HookCallbackDiagnostics,
  HookCallbackResult,
  HookRegistration,
  HookRunOptions,
  HookRunResult,
  HookRunner,
  HookRunnerOptions,
} from "./types.js";
export * from "./workspace-hook-trust-domain.js";

export * from "./workspace-hook-runtime-admission.js";
export * from "./workspace-hook-review-flow.js";
export * from "./workspace-hook-telemetry.js";
