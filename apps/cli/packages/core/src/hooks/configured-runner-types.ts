// SPDX-License-Identifier: Apache-2.0
import type { HookConfig, HookEventName, HookSourceKind } from "@knorvia/contracts";
import type { ConfiguredHookRunnerOptions, HookRegistration } from "./types.js";

/** 单条配置 Hook → 登记项的输入形状（模块内部参数，不进入公开导出面）。 */
export interface HookRegistrationInput {
  admission?: HookRegistration["admission"];
  budget: { maxOutputBytes: number; timeoutMs: number };
  event: HookEventName;
  hook: HookConfig;
  hookIndex: number;
  matcher: string | undefined;
  matcherIndex: number;
  options: ConfiguredHookRunnerOptions;
  source: string;
  sourceKind: HookSourceKind;
}
