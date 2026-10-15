// SPDX-License-Identifier: Apache-2.0
// 状态上下文形状：归因与传输的统一载体（runner-status 再导出）。字段语义见 behavior.md B53。

import type {
  ModelNetworkStatusEvent,
  ModelTransportKind,
  ModelRequestSessionType as ModelRequestSessionTypeValue,
  QueryId,
  ResolvedModelApiCallObservation,
  TraceId,
} from "@knorvia/contracts";
import type { ResolvedAiSdkModel } from "../runner-runtime.js";

export interface ModelStatusContext {
  traceId: TraceId; // 追踪 id（缺省生成）
  queryId?: QueryId; // 查询 id
  sessionId?: ModelNetworkStatusEvent["sessionId"]; // 会话 id
  turnId?: ModelNetworkStatusEvent["turnId"]; // 回合 id
  parentSessionId?: ModelNetworkStatusEvent["parentSessionId"]; // 父会话 id
  toolCallId?: string; // 工具调用 id
  spanId?: string; // span id
  parentSpanId?: string; // 父 span id
  querySource?: string; // 查询来源
  requestId: string; // 物理请求 id（attempt≥2 重新生成）
  providerId: ResolvedAiSdkModel["providerId"]; // provider 身份
  modelId: ResolvedAiSdkModel["modelId"]; // 模型身份
  modelRequestSessionType: ModelRequestSessionTypeValue; // 会话类型
  baseURL?: string; // 端点
  providerKind?: string; // SDK 种类
  transport: ModelTransportKind; // 传输形态（http/sse）
  maxAttempts: number; // 尝试上限（对外换算）
  streamRecovery?: ModelNetworkStatusEvent["streamRecovery"]; // 流恢复标记
  modelCall: ResolvedModelApiCallObservation; // 调用观察（actor/operation）
}
