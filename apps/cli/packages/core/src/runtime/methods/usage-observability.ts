// SPDX-License-Identifier: Apache-2.0
// 用量事实入口：三写口径在 support/usage-facts.ts（四方法门槛静默、写失败 warn 吞掉），
// 这里保持兼容导出面。
import type { SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import {
  writeModelUsageFact,
  writeToolUsageFact,
  writeTurnUsageFact,
  type ModelUsageFactInput,
  type TurnUsageFactInput,
} from "./support/usage-facts.js";

export async function recordModelUsageFact(
  runtime: AgentRuntimeInternal,
  input: ModelUsageFactInput,
): Promise<void> {
  await writeModelUsageFact(runtime, input);
}

export async function recordTurnUsageFact(
  runtime: AgentRuntimeInternal,
  input: TurnUsageFactInput,
): Promise<void> {
  await writeTurnUsageFact(runtime, input);
}

export async function recordToolUsageFromEvent(
  runtime: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  await writeToolUsageFact(runtime, event, traceContext);
}
