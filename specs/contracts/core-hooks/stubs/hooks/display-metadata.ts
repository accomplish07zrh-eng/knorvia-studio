// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 display-metadata.ts）。仅签名，无实现。
import type { HookConfig, HookExecutionDescriptor } from "@knorvia/contracts";
export function createHookExecutionDescriptor(
  hook: HookConfig,
  timeoutMs: number,
  expandDisplayValue?: (value: string) => string,
): HookExecutionDescriptor {
  void hook;
  void timeoutMs;
  void expandDisplayValue;
  throw new Error("not implemented: core-hooks");
}
export function sanitizeHookDisplayText(value: string): string {
  void value;
  throw new Error("not implemented: core-hooks");
}
