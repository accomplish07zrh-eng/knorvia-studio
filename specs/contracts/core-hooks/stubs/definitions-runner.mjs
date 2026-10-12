// SPDX-License-Identifier: Apache-2.0
// core-hooks 桩：运行器/配置/显示/邮箱组（构建器见 build-stubs.mjs）。
import { header, imports, NOT_IMPLEMENTED } from "./shared.mjs";

export const runnerStubs = {
  "configured-runner.ts": `${header("configured-runner.ts")}${imports([
    "HooksRuntimeConfig",
    "SessionEvent",
    "ExecutionPort",
    "Logger",
    "HookInput",
    "WorkspaceHookBundleSnapshot",
  ])}
import type { WorkspaceHookRuntimeAdmissionPort } from "./workspace-hook-runtime-admission.js";
export type HookRunOptions = { matchValue?: string; matchValues?: readonly string[]; signal?: AbortSignal };
export type HookRunResult = { additionalContexts: string[]; [key: string]: unknown };
export type HookRunner = { run(input: HookInput, options?: HookRunOptions): Promise<HookRunResult> };
export type ConfiguredHookRunnerOptions = {
  config: HooksRuntimeConfig;
  emitEvent?: (event: SessionEvent) => Promise<void>;
  executionPort: ExecutionPort;
  getWorkingDirectory: () => string;
  logger?: Logger;
  workspaceHookAdmission?: WorkspaceHookRuntimeAdmissionPort;
  workspaceHookSnapshot?: WorkspaceHookBundleSnapshot;
};
export function createConfiguredHookRunner(options: ConfiguredHookRunnerOptions): HookRunner | undefined {
  void options;
  ${NOT_IMPLEMENTED}
}
`,

  "configured-runner-callback.ts": `${header("configured-runner-callback.ts")}${imports(["HookInput", "HookJSONOutput"])}
export function createConfiguredHookCallback(
  ...args: unknown[]
): (input: HookInput, context: unknown) => Promise<HookJSONOutput | undefined> {
  void args;
  ${NOT_IMPLEMENTED}
}
`,

  "configured-runner-input.ts": `${header("configured-runner-input.ts")}${imports([
    "HookConfig",
    "HookInput",
    "HookPluginContext",
  ])}
export function createCompatibleHookStdin(
  input: HookInput,
): Promise<{ cleanup: () => Promise<void>; value: string }> {
  void input;
  ${NOT_IMPLEMENTED}
}
export function resolveHookTimeoutMs(hook: HookConfig, defaultTimeoutMs: number): number {
  void hook;
  void defaultTimeoutMs;
  ${NOT_IMPLEMENTED}
}
export function createPluginEnvOverlay(
  plugin: HookPluginContext | undefined,
  input: HookInput,
  workingDirectory: string,
): { set: Record<string, string> } {
  void plugin;
  void input;
  void workingDirectory;
  ${NOT_IMPLEMENTED}
}
export function expandPluginVariables(
  value: string,
  plugin: HookPluginContext | undefined,
  input: HookInput,
  workingDirectory: string,
): string {
  void value;
  void plugin;
  void input;
  void workingDirectory;
  ${NOT_IMPLEMENTED}
}
`,

  "display-metadata.ts": `${header("display-metadata.ts")}${imports(["HookConfig", "HookExecutionDescriptor"])}
export function createHookExecutionDescriptor(
  hook: HookConfig,
  timeoutMs: number,
  expandDisplayValue?: (value: string) => string,
): HookExecutionDescriptor {
  void hook;
  void timeoutMs;
  void expandDisplayValue;
  ${NOT_IMPLEMENTED}
}
export function sanitizeHookDisplayText(value: string): string {
  void value;
  ${NOT_IMPLEMENTED}
}
`,

  "index.ts": `${header("index.ts")}
export { createConfiguredHookRunner } from "./configured-runner.js";
export { createHookExecutionDescriptor, sanitizeHookDisplayText } from "./display-metadata.js";
`,

  "session-mailbox.ts": `${header("session-mailbox.ts")}${imports([
    "HookEventName",
    "SessionId",
    "SessionMailboxPort",
    "TraceContext",
  ])}
export type HookRegistration = { callback: unknown; event: HookEventName; [key: string]: unknown };
export function createSessionMailboxHookRegistrations(options: {
  enqueuePendingInput?: (input: string, traceContext: TraceContext) => Promise<void>;
  mailbox: SessionMailboxPort;
  sessionId: SessionId;
}): HookRegistration[] {
  void options;
  ${NOT_IMPLEMENTED}
}
`,

  "types.ts": `${header("types.ts")}${imports([
    "ExecutionPort",
    "HookEventName",
    "HookExecutionDescriptor",
    "HookInput",
    "HookJSONOutput",
    "HookPermissionDecision",
    "HookSourceKind",
    "HooksRuntimeConfig",
    "Logger",
    "PermissionRequestHookDecision",
    "SessionEvent",
    "WorkspaceHookBundleSnapshot",
  ])}
import type { WorkspaceHookRuntimeAdmissionPort } from "./workspace-hook-runtime-admission.js";
export interface HookCallbackContext { hookIndex: number; signal?: AbortSignal }
export interface HookCallbackDiagnostics { errorMessage?: string; stderrPreview?: string; stdoutPreview?: string }
export interface HookCallbackResult { kind: "hookCallbackResult"; diagnostics?: HookCallbackDiagnostics; output?: HookJSONOutput }
export type HookCallback = (input: HookInput, context: HookCallbackContext) => HookJSONOutput | HookCallbackResult | void | Promise<HookJSONOutput | HookCallbackResult | void>;
export interface HookRunAdmissionDecision { allowed: boolean; reasonCode?: string; skipLifecycle?: boolean }
export interface HookRegistration {
  admission?: (input: HookInput) => HookRunAdmissionDecision;
  async?: boolean;
  callback: HookCallback;
  descriptor?: HookExecutionDescriptor | ((input: HookInput) => HookExecutionDescriptor);
  event: HookEventName;
  matcher?: string;
  source?: string;
  sourceKind?: HookSourceKind;
  timeoutMs?: number;
}
export interface HookRunOptions { matchValue?: string; matchValues?: readonly string[]; signal?: AbortSignal }
export interface HookRunResult {
  additionalContexts: string[];
  blockRequested?: boolean;
  hookPermissionDecisionReason?: string;
  permissionBehavior?: HookPermissionDecision;
  permissionRequestResult?: PermissionRequestHookDecision;
  preventContinuation?: boolean;
  stopShouldContinue?: boolean;
  stopReason?: string;
  updatedInput?: unknown;
}
export interface HookRunner { run(input: HookInput, options?: HookRunOptions): Promise<HookRunResult> }
export interface HookRunnerOptions {
  defaultTimeoutMs?: number;
  emitEvent?: (event: SessionEvent) => Promise<void>;
  hooks?: HookRegistration[];
  logger?: Logger;
}
export interface ConfiguredHookRunnerOptions {
  config: HooksRuntimeConfig;
  emitEvent?: (event: SessionEvent) => Promise<void>;
  executionPort: ExecutionPort;
  getWorkingDirectory: () => string;
  logger?: Logger;
  workspaceHookAdmission?: WorkspaceHookRuntimeAdmissionPort;
  workspaceHookSnapshot?: WorkspaceHookBundleSnapshot;
}
`,
};
