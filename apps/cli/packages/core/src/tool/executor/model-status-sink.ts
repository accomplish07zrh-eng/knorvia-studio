// SPDX-License-Identifier: Apache-2.0
// 工具内部模型请求的默认状态出口。
//
// statusSink 不该由每个调用点各自负责：漏设时请求照样过准入闸门、照样排队，但 runner 发出的
// queued / admitted / 429 事件没有去处——执行器的 deadline 不知道要暂停，driver 也看不见子代理在等。
// 处置与准入端口一致：默认值绑在**边界**上（执行器交给 handler 的 context.model 先套一层），
// 调用点没设 sink 时补会话事件出口，自己设了则原样保留（默认值不压调用层）。

import {
  SessionEventType,
  getCurrentModelInvocationContext,
  type Model,
  type ModelNetworkStatusEvent,
  type ModelStatusSink,
} from "@knorvia/contracts";
import { withModelInvocationContext } from "../../runtime/methods/runtime-model.js";
import type { ToolExecutionContext } from "../types.js";

const MODEL_NETWORK_STATUS_EVENT = SessionEventType.ModelNetworkStatus;
const INITIAL_SEQUENCE_NUMBER = 0;

/** 模型网络状态事件。 */
type NetworkStatusEvent = ModelNetworkStatusEvent;

type StatusSinkContext = Pick<
  ToolExecutionContext,
  "emitEvent" | "sessionId" | "turnId" | "traceId"
>;
type OptionalModel = Model | undefined;
type OptionalStatusSink = ModelStatusSink | undefined;

// 所有会话事件共用的信封字段；payload 由调用方补。
function sessionEnvelope(scope: StatusSinkContext) {
  const eventId = crypto.randomUUID() as never;
  const timestamp = new Date();
  return {
    id: eventId,
    sessionId: scope.sessionId,
    turnId: scope.turnId,
    type: MODEL_NETWORK_STATUS_EVENT,
    timestamp,
    traceId: scope.traceId,
    sequenceNumber: INITIAL_SEQUENCE_NUMBER,
  };
}

export function createToolModelStatusSink(context: StatusSinkContext): OptionalStatusSink {
  const emit = context.emitEvent;
  if (emit === undefined) return undefined;
  return {
    publish: async (statusEvent: NetworkStatusEvent) => {
      await emit({ ...sessionEnvelope(context), payload: statusEvent });
    },
  };
}

function hasStatusSink(): boolean {
  return getCurrentModelInvocationContext()?.statusSink !== undefined;
}

export function withDefaultToolModelStatusSink(
  model: OptionalModel,
  sink: OptionalStatusSink,
): OptionalModel {
  if (model === undefined) return model;
  if (sink === undefined) return model;
  return withModelInvocationContext(model, () => (hasStatusSink() ? {} : { statusSink: sink }));
}
