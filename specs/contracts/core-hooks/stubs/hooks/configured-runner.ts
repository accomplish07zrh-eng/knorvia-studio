// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 configured-runner.ts）。仅签名，无实现。
import type {
  ExecutionPort,
  HookInput,
  HooksRuntimeConfig,
  Logger,
  SessionEvent,
  WorkspaceHookBundleSnapshot,
} from "@knorvia/contracts";
import type { WorkspaceHookRuntimeAdmissionPort } from "./workspace-hook-runtime-admission.js";
export type HookRunOptions = {
  matchValue?: string;
  matchValues?: readonly string[];
  signal?: AbortSignal;
};
export type HookRunResult = { additionalContexts: string[]; [key: string]: unknown };
export type HookRunner = {
  run(input: HookInput, options?: HookRunOptions): Promise<HookRunResult>;
};
export type ConfiguredHookRunnerOptions = {
  config: HooksRuntimeConfig;
  emitEvent?: (event: SessionEvent) => Promise<void>;
  executionPort: ExecutionPort;
  getWorkingDirectory: () => string;
  logger?: Logger;
  workspaceHookAdmission?: WorkspaceHookRuntimeAdmissionPort;
  workspaceHookSnapshot?: WorkspaceHookBundleSnapshot;
};
export function createConfiguredHookRunner(
  options: ConfiguredHookRunnerOptions,
): HookRunner | undefined {
  void options;
  throw new Error("not implemented: core-hooks");
}
