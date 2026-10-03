import { SessionEventType, createSessionEvent } from "../deps.js";
import type { TraceContext } from "../deps.js";
import { measureUtf8Bytes, previewInput } from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { updateInputs } from "./steering-persistence.js";

export async function editPendingInputById(
  this: AgentRuntimeInternal,
  options: { pendingInputId: string; newText: string; traceContext: TraceContext },
): Promise<boolean> {
  const activeTurn = this.activeTurn;
  const pending = activeTurn?.pendingInputs.find((item) => item.id === options.pendingInputId);
  if (activeTurn && pending) {
    await updateInputs(this, [{ id: pending.id, text: options.newText }]);
    pending.input = options.newText;
    const event = createSessionEvent(
      SessionEventType.TurnSteerQueued,
      this.sessionId,
      {
        pendingInputId: pending.id,
        queryId: pending.queryId,
        input: options.newText,
        inputPreview: previewInput(options.newText),
        inputSize: measureUtf8Bytes(options.newText),
        ...(pending.commandKind ? { commandKind: pending.commandKind } : {}),
        ...(pending.delivery ? { delivery: pending.delivery } : {}),
        ...(pending.inputPresentation ? { inputPresentation: pending.inputPresentation } : {}),
        ...(pending.intent ? { intent: pending.intent } : {}),
        ...(pending.toolDisallowlist ? { toolDisallowlist: pending.toolDisallowlist } : {}),
        queueLength: activeTurn.pendingInputs.length,
        targetTurnId: activeTurn.turnId,
      },
      { traceId: activeTurn.traceContext.traceId, turnId: activeTurn.turnId },
    );
    await this.appendEvent(event, options.traceContext);
    return true;
  }
  const projection = await this.rebuildProjection();
  const held = projection.pendingSteerInputs.find(
    (item) => item.pendingInputId === options.pendingInputId,
  );
  if (!held) return false;
  await updateInputs(this, [{ id: held.pendingInputId, text: options.newText }]);
  const event = createSessionEvent(
    SessionEventType.TurnSteerQueued,
    this.sessionId,
    {
      pendingInputId: held.pendingInputId,
      input: options.newText,
      inputPreview: previewInput(options.newText),
      inputSize: measureUtf8Bytes(options.newText),
      ...(held.commandKind ? { commandKind: held.commandKind } : {}),
      ...(held.intent ? { intent: held.intent } : {}),
      ...(held.toolDisallowlist ? { toolDisallowlist: held.toolDisallowlist } : {}),
      queueLength: projection.pendingSteerInputs.length,
      targetTurnId: held.targetTurnId,
    },
    { traceId: options.traceContext.traceId, turnId: held.targetTurnId },
  );
  await this.appendEvent(event, options.traceContext);
  return true;
}

export async function reorderPendingInput(
  this: AgentRuntimeInternal,
  options: {
    pendingInputId: string;
    beforePendingInputId: string | null;
    traceContext: TraceContext;
  },
): Promise<boolean> {
  const activeTurn = this.activeTurn;
  const index =
    activeTurn?.pendingInputs.findIndex((item) => item.id === options.pendingInputId) ?? -1;
  if (!activeTurn || index < 0) {
    const projection = await this.rebuildProjection();
    const orderedPendingInputIds = projection.pendingSteerInputs.map((item) => item.pendingInputId);
    const sourceIndex = orderedPendingInputIds.indexOf(options.pendingInputId);
    if (sourceIndex < 0) return false;
    const [selected] = orderedPendingInputIds.splice(sourceIndex, 1);
    if (selected === undefined) return false;
    const anchorIndex =
      options.beforePendingInputId === null
        ? -1
        : orderedPendingInputIds.indexOf(options.beforePendingInputId);
    orderedPendingInputIds.splice(
      anchorIndex < 0 ? orderedPendingInputIds.length : anchorIndex,
      0,
      selected,
    );
    await updateInputs(
      this,
      orderedPendingInputIds.map((id, queuePosition) => ({ id, queuePosition })),
    );
    const targetTurnId =
      projection.pendingSteerInputs.find((item) => item.pendingInputId === options.pendingInputId)
        ?.targetTurnId ?? projection.pendingSteerInputs[0]?.targetTurnId;
    const event = createSessionEvent(
      SessionEventType.TurnSteerReordered,
      this.sessionId,
      { orderedPendingInputIds, targetTurnId },
      { traceId: options.traceContext.traceId, turnId: targetTurnId },
    );
    await this.appendEvent(event, options.traceContext);
    return true;
  }
  const reordered = [...activeTurn.pendingInputs];
  const [selected] = reordered.splice(index, 1);
  if (!selected) return false;
  const anchorIndex =
    options.beforePendingInputId === null
      ? -1
      : reordered.findIndex((item) => item.id === options.beforePendingInputId);
  reordered.splice(anchorIndex < 0 ? reordered.length : anchorIndex, 0, selected);
  const updated = reordered.map((item, queuePosition) =>
    item.intent ? { ...item, intent: { ...item.intent, queuePosition } } : item,
  );
  await updateInputs(
    this,
    updated.map((item, queuePosition) => ({ id: item.id, queuePosition })),
  );
  activeTurn.pendingInputs.splice(0, activeTurn.pendingInputs.length, ...updated);
  const orderedPendingInputIds = updated.map((item) => item.id);
  const event = createSessionEvent(
    SessionEventType.TurnSteerReordered,
    this.sessionId,
    { orderedPendingInputIds, targetTurnId: activeTurn.turnId },
    { traceId: activeTurn.traceContext.traceId, turnId: activeTurn.turnId },
  );
  await this.appendEvent(event, options.traceContext);
  return true;
}
