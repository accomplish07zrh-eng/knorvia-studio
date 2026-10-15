// SPDX-License-Identifier: Apache-2.0
// 持久化事件分派入口：八类分派与两制错误语义在 support/durable-dispatch.ts（KD-1 原样），
// 这里保持兼容导出面。
import type { SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { persistDurableEvent as dispatchDurableEvent } from "./support/durable-dispatch.js";

export async function persistDurableEvent(
  runtime: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  await dispatchDurableEvent(runtime, event, traceContext);
}
