import { parseRuntimeInputPresentation } from "@knorvia/contracts";
import {
  unpublishedPermissionGrants,
  recoverPendingPermissionGrant,
} from "../permission-grant-recovery.js";
import { runtimeInputMetadata } from "../../agent/runtime-input-presentation.js";
import {
  SessionEventType,
  createMessageId,
  createSessionEvent,
  traceContextToLogContext,
} from "../deps.js";
import type { SessionEvent, TraceContext, TurnId } from "../deps.js";
import {
  buildUserContentFromTurn,
  measureUtf8Bytes,
  previewInput,
  resolveTurnAttachments,
} from "../helpers/index.js";
import type { ActiveTurnSteeringState, DrainedPendingInputDiagnostics } from "../types.js";
import { createRuntimeUserEntry, realUserRuntimeMetadata } from "../../agent/message-history.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { firstInlineGuide } from "./steering-guides.js";

type DrainOptions = {
  activeTurn: ActiveTurnSteeringState;
  events: SessionEvent[];
  traceContext: TraceContext;
};

export async function drainPendingInput(
  this: AgentRuntimeInternal,
  options: DrainOptions,
): Promise<DrainedPendingInputDiagnostics | undefined> {
  if (this.permissionFullAccessPending || this.activeTurn !== options.activeTurn) return undefined;
  if (unpublishedPermissionGrants.has(this)) await recoverPendingPermissionGrant(this);
  if (this.permissionFullAccessPending || this.activeTurn !== options.activeTurn) return undefined;
  this.pendingInputDrains = (this.pendingInputDrains ?? 0) + 1;
  try {
    return await drainGuide(this, options);
  } finally {
    this.pendingInputDrains -= 1;
  }
}

async function drainGuide(
  runtime: AgentRuntimeInternal,
  options: DrainOptions,
): Promise<DrainedPendingInputDiagnostics | undefined> {
  const activeTurn = options.activeTurn;
  const pending = firstInlineGuide(activeTurn);
  if (!pending || runtime.pendingInputReservations.has(pending.id)) return undefined;
  const index = activeTurn.pendingInputs.indexOf(pending);
  activeTurn.pendingInputs.splice(index, 1);
  const queryIds = pending.queryId ? [pending.queryId] : undefined;
  const drainTraceContext = pending.queryId
    ? { ...options.traceContext, queryId: pending.queryId }
    : options.traceContext;
  const drainedAt = Date.now();
  const inputPreviews: string[] = [];
  const inputSizes: number[] = [];
  const queuedDurationsMs: number[] = [];
  const messageId = createMessageId();
  const resolvedAttachments = await resolveTurnAttachments(pending.attachments, {
    artifactStore: runtime.artifactStore,
    fileSystemPort: runtime.fileSystemPort,
    imageProcessorPort: runtime.imageProcessorPort,
    sessionId: runtime.sessionId,
    traceContext: drainTraceContext,
    turnId: activeTurn.turnId,
    workingDirectory: runtime.workingDirectory,
  });
  const delivery = pending.delivery ?? "queue";
  const inputPresentation =
    delivery === "guide" && !pending.source && !pending.attachments?.length
      ? parseRuntimeInputPresentation(pending.inputPresentation)
      : undefined;
  const entry = createRuntimeUserEntry(
    buildUserContentFromTurn(pending.input, resolvedAttachments),
    runtimeInputMetadata(inputPresentation) ?? realUserRuntimeMetadata(),
  );
  runtime.messageHistory.addEntries([entry]);
  await runtime.persistUserPrompt(
    messageId,
    pending.input,
    resolvedAttachments,
    drainTraceContext,
    {
      steerDelivery: delivery,
      inputPresentation,
      sessionInputId: pending.id,
      sourceCommandId: pending.intent?.sourceCommandId ?? String(pending.queryId ?? pending.id),
      clientId: pending.intent?.clientId,
      intent: pending.intent,
    },
  );
  inputPreviews.push(previewInput(pending.input));
  inputSizes.push(measureUtf8Bytes(pending.input));
  queuedDurationsMs.push(drainedAt - pending.queuedAt.getTime());
  const injectedMessageIds = [messageId];
  const pendingInputIds = [pending.id];
  const runtimeEntries = [entry];
  const drainedInputs = [
    {
      pendingInputId: pending.id,
      messageId,
      text: pending.input,
      delivery,
      ...(pending.intent ? { intent: pending.intent } : {}),
      toolDisallowlist: pending.toolDisallowlist,
    },
  ];
  const toolDisallowlist = [...new Set(pending.toolDisallowlist ?? [])];
  const event = runtime.createEvent(
    SessionEventType.TurnSteerDrained,
    {
      injectedMessageIds,
      pendingInputIds,
      drainedInputs,
      ...(queryIds ? { queryIds } : {}),
      targetTurnId: activeTurn.turnId,
    },
    drainTraceContext,
  );
  await runtime.appendEvent(event, drainTraceContext);
  options.events.push(event);
  runtime.logger?.debug("Turn steer drained", {
    ...traceContextToLogContext(drainTraceContext),
    drainedCount: pendingInputIds.length,
    event: "turn.steer.drained",
    injectedMessageIds,
    inputPreviews,
    inputSizes,
    module: "core.runtime",
    pendingInputIds,
    queryIds,
    queuedDurationsMs,
    status: "completed",
    targetTurnId: activeTurn.turnId,
  });
  return {
    injectedMessageIds,
    ...(pending.intent ? { intent: pending.intent } : {}),
    latestMessageId: injectedMessageIds[injectedMessageIds.length - 1],
    pendingInputIds,
    queryIds,
    runtimeEntries,
    ...(toolDisallowlist.length ? { toolDisallowlist } : {}),
  };
}

export async function discardPendingInput(
  this: AgentRuntimeInternal,
  options: {
    activeTurn: ActiveTurnSteeringState;
    events?: SessionEvent[];
    reason: "turn_cancelled" | "turn_failed" | "session_resumed";
    traceContext: TraceContext;
  },
): Promise<void> {
  const activeTurn = options.activeTurn;
  if (this.activeTurn !== activeTurn) return;
  const pendingInputIds = activeTurn.pendingInputs.splice(0).map((item) => item.id);
  if (!pendingInputIds.length) return;
  const event = createSessionEvent(
    SessionEventType.TurnSteerDiscarded,
    this.sessionId,
    {
      pendingInputIds,
      reason: options.reason,
      targetTurnId: activeTurn.turnId,
    },
    { traceId: activeTurn.traceContext.traceId, turnId: activeTurn.turnId },
  );
  await this.appendEvent(event, options.traceContext);
  options.events?.push(event);
  logDiscard(this, pendingInputIds, options.reason, activeTurn.turnId, options.traceContext);
}

function logDiscard(
  runtime: AgentRuntimeInternal,
  pendingInputIds: string[],
  reason: "turn_cancelled" | "turn_failed" | "session_resumed",
  targetTurnId: TurnId,
  traceContext: TraceContext,
): void {
  runtime.logger?.debug("Turn steer discarded", {
    ...traceContextToLogContext(traceContext),
    discardedCount: pendingInputIds.length,
    event: "turn.steer.discarded",
    module: "core.runtime",
    pendingInputIds,
    reason,
    status: "completed",
    targetTurnId,
  });
}

export async function discardPersistedPendingSteerInputs(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<number> {
  try {
    const admitted =
      (await this.sessionStore?.listSessionInputs?.({
        sessionID: this.sessionId,
        status: "admitted",
      })) ?? [];
    for (const input of admitted)
      await this.sessionStore?.settleSessionInput?.({
        id: input.id,
        sessionID: this.sessionId,
        status: "discarded",
        reason: "session_resumed",
      });
  } catch (error) {
    this.logger?.warn("Failed to sweep admitted session inputs on resume", {
      ...traceContextToLogContext(traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "session_input.resume_sweep_failed",
      module: "core.runtime",
      status: "failed",
    });
  }
  const projection = await this.rebuildProjection();
  if (!projection.pendingSteerInputs.length) return 0;
  const groups = new Map<TurnId, string[]>();
  for (const pending of projection.pendingSteerInputs) {
    const ids = groups.get(pending.targetTurnId);
    if (ids) ids.push(pending.pendingInputId);
    else groups.set(pending.targetTurnId, [pending.pendingInputId]);
  }
  for (const [targetTurnId, pendingInputIds] of groups) {
    const event = createSessionEvent(
      SessionEventType.TurnSteerDiscarded,
      this.sessionId,
      { pendingInputIds, reason: "session_resumed", targetTurnId },
      { traceId: traceContext.traceId, turnId: targetTurnId },
    );
    await this.appendEvent(event, traceContext);
    logDiscard(this, pendingInputIds, "session_resumed", targetTurnId, traceContext);
  }
  return projection.pendingSteerInputs.length;
}
