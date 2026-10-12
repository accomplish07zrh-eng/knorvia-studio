// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 configured-runner-input.ts）。仅签名，无实现。
import type { HookConfig, HookInput, HookPluginContext } from "@knorvia/contracts";
export function createCompatibleHookStdin(
  input: HookInput,
): Promise<{ cleanup: () => Promise<void>; value: string }> {
  void input;
  throw new Error("not implemented: core-hooks");
}
export function resolveHookTimeoutMs(hook: HookConfig, defaultTimeoutMs: number): number {
  void hook;
  void defaultTimeoutMs;
  throw new Error("not implemented: core-hooks");
}
export function createPluginEnvOverlay(
  plugin: HookPluginContext | undefined,
  input: HookInput,
  workingDirectory: string,
): { set: Record<string, string> } {
  void plugin;
  void input;
  void workingDirectory;
  throw new Error("not implemented: core-hooks");
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
  throw new Error("not implemented: core-hooks");
}
