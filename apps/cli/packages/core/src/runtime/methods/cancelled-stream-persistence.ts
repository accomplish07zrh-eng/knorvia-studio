// SPDX-License-Identifier: Apache-2.0
// 取消流快照持久化入口：逐块落盘口径在 support/cancel-snapshot.ts，这里保持兼容导出面。
import type { MessageId, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RuntimeModelStreamSnapshot } from "../types.js";
import { persistCancelledParts } from "./support/cancel-snapshot.js";

export async function persistCancelledStreamSnapshot(
  runtime: AgentRuntimeInternal,
  options: {
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    snapshot: RuntimeModelStreamSnapshot;
    traceContext: TraceContext;
  },
): Promise<void> {
  await persistCancelledParts(runtime, options);
}
