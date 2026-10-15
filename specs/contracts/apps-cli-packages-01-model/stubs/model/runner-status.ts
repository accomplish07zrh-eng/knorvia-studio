// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export {
  createModelRequestAttributionHeaders,
  normalizeModelSessionIdForAttribution,
  resolveModelRequestSessionType,
} from "./runner-attribution.js";
export interface ModelStatusContext {
  traceId: TraceId;
  queryId?: QueryId;
  sessionId?: ModelNetworkStatusEvent["sessionId"];
  turnId?: ModelNetworkStatusEvent["turnId"];
  parentSessionId?: ModelNetworkStatusEvent["parentSessionId"];
  toolCallId?: string;
  spanId?: string;
  parentSpanId?: string;
  querySource?: string;
  requestId: string;
  providerId: ResolvedAiSdkModel["providerId"];
  modelId: ResolvedAiSdkModel["modelId"];
  modelRequestSessionType: ModelRequestSessionTypeValue;
  baseURL?: string;
  providerKind?: string;
  transport: ModelTransportKind;
  maxAttempts: number;
  streamRecovery?: ModelNetworkStatusEvent["streamRecovery"];
  modelCall: ResolvedModelApiCallObservation;
}
export function createStatusContext(input: {
  maxAttempts: number;
  request: AiSdkModelTextRequest;
  resolved: ResolvedAiSdkModel;
  transport: ModelTransportKind;
}): ModelStatusContext {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function createAttemptStatusContext(
  context: ModelStatusContext,
  attempt: number,
): ModelStatusContext {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export async function publishModelStatus(
  event: ModelNetworkStatusEvent,
  options: PublishOptions,
): Promise<void> {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function admissionWaitPublishers(
  context: ModelStatusContext,
  attempt: number,
  options: PublishOptions,
): { onQueued: () => Promise<void>; onAdmitted: (queuedMs: number) => Promise<void> } {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export async function publishModelTelemetryMilestone(
  event: Extract<
    ModelNetworkStatusEvent,
    { type: "model_first_provider_event" | "model_first_content" | "model_first_text" }
  >,
  options: { logger?: Logger; statusSink?: ModelStatusSink },
): Promise<void> {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function modelStatusContextToLogContext(
  context: ModelStatusContext | ModelNetworkStatusEvent,
  attempt: number,
): Record<string, unknown> {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
