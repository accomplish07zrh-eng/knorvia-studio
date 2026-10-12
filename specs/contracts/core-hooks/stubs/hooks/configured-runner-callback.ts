// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 configured-runner-callback.ts）。仅签名，无实现。
import type { HookInput, HookJSONOutput } from "@knorvia/contracts";
export function createConfiguredHookCallback(
  ...args: unknown[]
): (input: HookInput, context: unknown) => Promise<HookJSONOutput | undefined> {
  void args;
  throw new Error("not implemented: core-hooks");
}
