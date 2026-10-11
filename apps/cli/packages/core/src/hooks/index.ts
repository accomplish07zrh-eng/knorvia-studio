// SPDX-License-Identifier: Apache-2.0
// hooks 模块的桶入口。对外只暴露 interface.md 列出的名字；内部文件怎么拆不从这里可见。
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
