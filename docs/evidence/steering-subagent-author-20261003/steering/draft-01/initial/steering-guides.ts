import { SessionEventType, traceContextToLogContext } from "../deps.js";
import type { PendingTurnInput, SessionEvent, TraceContext } from "../deps.js";
import type { ActiveTurnSteeringState } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";

export function effectiveDelivery(pending: PendingTurnInput | undefined): "guide" | "queue" {
  return (pending?.delivery ?? pending?.intent?.admittedDelivery) === "guide" ? "guide" : "queue";
}

export function firstInlineGuide(activeTurn: ActiveTurnSteeringState): PendingTurnInput | undefined {
  return activeTurn.pendingInputs.find(item => item.commandKind !== "sendGoalCommand" && item.commandKind !== "compact" && effectiveDelivery(item) === "guide");
}

export function hasPendingInput(this: AgentRuntimeInternal, activeTurn: ActiveTurnSteeringState): boolean {
  return this.activeTurn === activeTurn && activeTurn.pendingInputs.length > 0;
}

export function hasInlineGuidePendingInput(this: AgentRuntimeInternal, activeTurn: ActiveTurnSteeringState): boolean {
  const pending = firstInlineGuide(activeTurn);
  return this.activeTurn === activeTurn && !this.permissionFullAccessPending && !this.queueExternalDrainActive &&
    !this.pendingInputReservations.has(pending?.id ?? "") && pending?.commandKind !== "sendGoalCommand" &&
    pending?.commandKind !== "compact" && effectiveDelivery(pending) === "guide";
}

export async function fallbackPendingGuidesToQueue(this: AgentRuntimeInternal, options: { activeTurn: ActiveTurnSteeringState; events?: SessionEvent[]; reasonCode: "guide.noToolBoundary" | "guide.turnInterrupted"; traceContext: TraceContext }): Promise<number> {
  const activeTurn = options.activeTurn;
  if (this.activeTurn !== activeTurn) return 0;
  let count = 0;
  for (const pending of activeTurn.pendingInputs) {
    if (effectiveDelivery(pending) !== "guide") continue;
    const intent = pending.intent ? { ...pending.intent, admittedDelivery: "queue", fallbackReasonCode: options.reasonCode } : undefined;
    const event = this.createEvent(SessionEventType.TurnSteerDeliveryChanged, {
      admittedDelivery: "queue", fallbackReasonCode: options.reasonCode,
      ...(intent ? { intent } : {}), pendingInputId: pending.id, requestedDelivery: "guide", targetTurnId: activeTurn.turnId,
    }, options.traceContext);
    await this.appendEvent(event, options.traceContext);
    options.events?.push(event);
    pending.delivery = "queue";
    if (intent) pending.intent = intent;
    count += 1;
    this.logger?.debug("Guide input fell back to ordinary queue", {
      ...traceContextToLogContext(options.traceContext), event: "turn.guide.fell_back", fallbackReasonCode: options.reasonCode,
      module: "core.runtime", pendingInputId: pending.id, status: "completed", targetTurnId: activeTurn.turnId,
    });
  }
  return count;
}
