import { SessionEventType, createQueryId, createSessionEvent, traceContextToLogContext } from "../deps.js";
import type { TraceContext, TurnId, TurnSteerInput, TurnSteerRejectReason, TurnSteerResult, PendingTurnInput } from "../deps.js";
import { measureUtf8Bytes, MAX_TURN_STEER_INPUT_BYTES, previewInput } from "../helpers/index.js";
import type { ActiveTurnSteeringState } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";

export async function steerTurn(this: AgentRuntimeInternal, input: string | TurnSteerInput): Promise<TurnSteerResult> {
  const request = typeof input === "string" ? { input } : input;
  const activeTurn = this.activeTurn;
  const inputSize = measureUtf8Bytes(request.input);
  const inputPreview = previewInput(request.input);
  const rejection = { activeTurn, expectedTurnId: request.expectedTurnId, inputPreview, inputSize, traceContext: request.traceContext };
  if (!request.input.trim() && !request.attachments?.length) return await this.rejectTurnSteer("empty_input", rejection);
  if (inputSize > MAX_TURN_STEER_INPUT_BYTES) return await this.rejectTurnSteer("input_too_large", rejection);
  if (!activeTurn) return await this.rejectTurnSteer("no_active_turn", { expectedTurnId: request.expectedTurnId, inputPreview, inputSize, traceContext: request.traceContext });
  if (request.expectedTurnId !== undefined && request.expectedTurnId !== activeTurn.turnId) return await this.rejectTurnSteer("expected_turn_mismatch", rejection);
  if (!activeTurn.steerable) return await this.rejectTurnSteer("turn_not_steerable", rejection);
  const queryId = request.queryId ?? request.inputId ?? createQueryId();
  const { commandKind, source, delivery, toolDisallowlist } = request;
  const queuePosition = activeTurn.pendingInputs.length;
  const intent = request.intent ? { ...request.intent, admittedDelivery: request.delivery ?? request.intent.admittedDelivery, queuePosition } : undefined;
  const pending: PendingTurnInput = {
    id: request.pendingInputId ?? request.intent?.queueItemId ?? this.createPendingInputId(activeTurn.turnId),
    input: request.input,
    queuedAt: new Date(),
    traceId: activeTurn.traceContext.traceId,
    queryId,
    ...(commandKind ? { commandKind } : {}),
    ...(source ? { source } : {}),
    ...(request.inputPresentation ? { inputPresentation: request.inputPresentation } : {}),
    ...(delivery ? { delivery } : {}),
    ...(intent ? { intent } : {}),
    ...(request.attachments ? { attachments: request.attachments } : {}),
    ...(toolDisallowlist ? { toolDisallowlist } : {}),
    turnId: activeTurn.turnId,
  };
  activeTurn.pendingInputs.push(pending);
  const queueLength = activeTurn.pendingInputs.length;
  const event = createSessionEvent(SessionEventType.TurnSteerQueued, this.sessionId, {
    inputId: request.inputId, queryId, pendingInputId: pending.id, input: request.input, inputPreview, inputSize,
    ...(commandKind ? { commandKind } : {}), ...(source ? { source } : {}),
    ...(request.inputPresentation ? { inputPresentation: request.inputPresentation } : {}),
    ...(delivery ? { delivery } : {}), ...(intent ? { intent } : {}),
    ...(toolDisallowlist ? { toolDisallowlist } : {}), targetTurnId: activeTurn.turnId, queueLength,
  }, { traceId: activeTurn.traceContext.traceId, turnId: activeTurn.turnId });
  await this.appendEvent(event, activeTurn.traceContext);
  this.logger?.debug("Turn steer queued", {
    ...traceContextToLogContext(activeTurn.traceContext), activeTurnKind: activeTurn.kind, activeTurnSteerable: activeTurn.steerable,
    inputId: request.inputId, queryId, event: "turn.steer.queued", expectedTurnId: request.expectedTurnId,
    inputPreview, inputSize, module: "core.runtime", pendingInputId: pending.id, queueLength,
    ...(source ? { source } : {}), ...(request.inputPresentation ? { inputPresentation: request.inputPresentation } : {}),
    status: "waiting", targetTurnId: activeTurn.turnId,
  });
  return { kind: "queued", pendingInputId: pending.id, queueLength, turnId: activeTurn.turnId };
}

export async function enqueueDeferredInput(this: AgentRuntimeInternal, input: string | TurnSteerInput): Promise<TurnSteerResult> {
  const request = typeof input === "string" ? { input } : input;
  const inputSize = measureUtf8Bytes(request.input);
  const inputPreview = previewInput(request.input);
  const traceContext = request.traceContext ?? this.rootTraceContext;
  if (!request.input.trim() && !request.attachments?.length) return await this.rejectTurnSteer("empty_input", { inputPreview, inputSize, traceContext });
  if (inputSize > MAX_TURN_STEER_INPUT_BYTES) return await this.rejectTurnSteer("input_too_large", { inputPreview, inputSize, traceContext });
  const targetTurnId = this.activeTurn?.turnId ?? this.latestAssistantTurnId ?? traceContext.turnId ?? "deferred";
  const queryId = request.queryId ?? request.inputId ?? createQueryId();
  const { commandKind, source, toolDisallowlist } = request;
  const delivery = request.delivery ?? "queue";
  const pendingInputId = request.pendingInputId ?? request.intent?.queueItemId ?? this.createPendingInputId(targetTurnId);
  const projection = await this.rebuildProjection();
  const queueLength = projection.pendingSteerInputs.length + 1;
  const intent = request.intent ? { ...request.intent, admittedDelivery: delivery, queuePosition: queueLength - 1 } : undefined;
  const event = createSessionEvent(SessionEventType.TurnSteerQueued, this.sessionId, {
    ...(request.inputId ? { inputId: request.inputId } : {}), queryId, pendingInputId, input: request.input, inputPreview, inputSize,
    ...(commandKind ? { commandKind } : {}), ...(source ? { source } : {}),
    ...(request.inputPresentation ? { inputPresentation: request.inputPresentation } : {}), delivery,
    ...(intent ? { intent } : {}), ...(toolDisallowlist ? { toolDisallowlist } : {}), targetTurnId, queueLength,
  }, { traceId: traceContext.traceId, turnId: targetTurnId });
  await this.appendEvent(event, traceContext);
  this.logger?.debug("Deferred input queued", {
    ...traceContextToLogContext(traceContext), delivery, event: "turn.deferred_input.queued", inputId: request.inputId,
    inputPreview, inputSize, module: "core.runtime", pendingInputId, queueLength, status: "waiting", targetTurnId,
  });
  return { kind: "queued", pendingInputId, queueLength, turnId: targetTurnId };
}

export async function rejectTurnSteer(this: AgentRuntimeInternal, reason: TurnSteerRejectReason, options: { activeTurn?: ActiveTurnSteeringState; expectedTurnId?: TurnId; inputPreview?: string; inputSize?: number; traceContext?: TraceContext }): Promise<TurnSteerResult> {
  const traceContext = options.activeTurn?.traceContext ?? options.traceContext ?? this.rootTraceContext;
  const activeTurn = options.activeTurn;
  const event = createSessionEvent(SessionEventType.TurnSteerRejected, this.sessionId, {
    activeTurnId: activeTurn?.turnId, expectedTurnId: options.expectedTurnId, inputPreview: options.inputPreview, inputSize: options.inputSize, reason,
  }, { traceId: traceContext.traceId, turnId: activeTurn?.turnId });
  await this.appendEvent(event, traceContext);
  this.logger?.debug("Turn steer rejected", {
    ...traceContextToLogContext(traceContext), activeQueueLength: activeTurn?.pendingInputs.length, activeTurnId: activeTurn?.turnId,
    activeTurnKind: activeTurn?.kind, activeTurnSteerable: activeTurn?.steerable, event: "turn.steer.rejected",
    expectedTurnId: options.expectedTurnId, inputPreview: options.inputPreview, inputSize: options.inputSize,
    module: "core.runtime", reason, status: "completed",
  });
  return { activeTurnId: activeTurn?.turnId, kind: "rejected", reason };
}
