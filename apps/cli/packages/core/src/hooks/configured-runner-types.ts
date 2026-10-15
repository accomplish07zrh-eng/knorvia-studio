// SPDX-License-Identifier: Apache-2.0
import type { HookConfig, HookEventName, HookSourceKind } from "@knorvia/contracts";
import type { ConfiguredHookRunnerOptions, HookRegistration } from "./types.js";

/** 单条配置 Hook → 登记项的输入形状（模块内部参数，不进入公开导出面）。 */
export interface Budget {
  maxOutputBytes: number;
  timeoutMs: number;
}

/** 来源事件的能力名（与 HookEventName 同构）：把兼容字段名与事件枚举解耦。 */
export type HookSourceEvent = HookEventName;

/** 运行器装配参数的能力名（与 ConfiguredHookRunnerOptions 同构）。 */
export type HookRunnerSetup = ConfiguredHookRunnerOptions;

export interface HookRegistrationInput {
  admission?: HookRegistration["admission"];
  budget: Budget;
  event: HookEventName;
  hook: HookConfig;
  hookIndex: number;
  matcher: string | undefined;
  matcherIndex: number;
  options: ConfiguredHookRunnerOptions;
  source: string;
  sourceKind: HookSourceKind;
}
