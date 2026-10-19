// SPDX-License-Identifier: Apache-2.0

import type { RunEvent } from "./types.js";

/** 发起 run 的锚点：输入标识与脚本文件位置。 */
interface LaunchAnchor {
  readonly inputId: string;
  readonly scriptPath?: string;
}

/** 脚本声明的阶段表，以及与之按位置对齐的并行宽度表。 */
interface LaunchPhasePlan {
  readonly phaseNames?: readonly string[];
  readonly phaseAlongside?: readonly (readonly number[])[];
}

/** 发起 run 那一轮的上游会话锚点。 */
interface LaunchOrigin {
  readonly toolCallId?: string;
  readonly parentSessionId?: string;
}

/** 构造时注入的 launch 元数据；一经捕获即只读，引擎只负责转录。 */
export type RunLaunchConfig = LaunchAnchor &
  LaunchPhasePlan & {
    readonly subagentModel?: string;
  };

const ORIGIN_FIELDS = ["toolCallId", "parentSessionId"] as const;
const LAUNCH_FIELDS = ["phaseNames", "subagentModel", "scriptPath", "phaseAlongside"] as const;

/**
 * 把 launch 元数据转录成 `run-launched` 事件。未设的键保持缺席（而不是落成 undefined），
 * 读侧把「没设」与「设了个空」当两件事。
 */
export function runLaunchedEvent(config: RunLaunchConfig, origin: LaunchOrigin): RunEvent {
  const event: Record<string, unknown> = { inputId: config.inputId, type: "run-launched" };
  copyDefined(event, origin, ORIGIN_FIELDS);
  copyDefined(event, config, LAUNCH_FIELDS);
  return event as RunEvent;
}

function copyDefined<T extends object, K extends keyof T & string>(
  target: Record<string, unknown>,
  source: T,
  fields: readonly K[],
): void {
  for (const field of fields) {
    const value = source[field];
    if (value !== undefined) target[field] = value;
  }
}
