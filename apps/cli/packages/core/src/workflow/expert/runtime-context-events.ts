// SPDX-License-Identifier: Apache-2.0
// 工作流事件写入：单张字段表构造事件、落库并回调订阅者。
import type { WorkflowEvent } from "@knorvia/contracts";
import type { ExpertWorkflowRuntimeDeps } from "./types.js";

/** 事件写入的完成信号。 */
type Done = Promise<void>;

/** 事件写入选项：消息、节点、负载、相位与取消信号。 */
export type WorkflowEventOptions = {
  message?: string;
  nodeId?: string;
  payload?: Record<string, unknown>;
  phase?: string;
  signal?: AbortSignal;
};

/** 事件写入所需的最小上下文：定义类型、存储端口、时钟与可选回调。 */
export interface EventContext {
  definition: { kind: string };
  store: ExpertWorkflowRuntimeDeps["store"];
  timestamp(): string;
  onWorkflowEvent?: (event: WorkflowEvent) => void | Promise<void>;
}

/** 可选字段键：只有这些键允许缺省，其余字段必须始终出现。 */
const OPTIONAL_KEYS: ReadonlySet<string> = new Set(["message", "nodeId", "payload", "phase"]);

/** 事件行表：固定字段与可选字段同表，落库前过滤掉未提供的可选值。 */
const eventRows = (
  runtime: EventContext,
  targetRunId: string,
  eventType: WorkflowEvent["type"],
  input: WorkflowEventOptions,
): readonly (readonly [string, unknown])[] =>
  (
    [
      ["kind", runtime.definition.kind],
      ["runId", targetRunId],
      ["timestamp", runtime.timestamp()],
      ["type", eventType],
      ["message", input.message],
      ["nodeId", input.nodeId],
      ["payload", input.payload],
      ["phase", input.phase],
    ] as readonly (readonly [string, unknown])[]
  ).filter(([key, value]) => !OPTIONAL_KEYS.has(key) || value !== undefined);

/** 写入工作流事件并回调订阅者（先落库再回调，顺序即既有语义）。 */
export async function appendEvent(
  runtime: EventContext,
  targetRunId: string,
  eventType: WorkflowEvent["type"],
  input: WorkflowEventOptions = {},
): Done {
  const entries = eventRows(runtime, targetRunId, eventType, input);
  const event = Object.fromEntries(entries) as unknown as WorkflowEvent;
  await runtime.store.appendEvent(event, { signal: input.signal });
  await runtime.onWorkflowEvent?.(event);
}
