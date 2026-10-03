import { SessionEventType, createSessionEvent } from "../deps.js";
import type {
  CollaborationMode,
  ModelSelection,
  ModelSelectionOrigin,
  TraceContext,
} from "../deps.js";
import { cloneModelSelection } from "../model-selection.js";
import { createRuntimeModel } from "./runtime-model.js";
import type { AgentRuntimeInternal } from "../internal.js";

export async function setQueueAutoDrain(
  this: AgentRuntimeInternal,
  options: { autoDrain: boolean; traceContext: TraceContext },
): Promise<void> {
  if (options.autoDrain && !this.queueAutoDrain) this.queueExternalDrainActive = true;
  else if (!options.autoDrain) this.queueExternalDrainActive = false;
  this.queueAutoDrain = options.autoDrain;
  const event = createSessionEvent(
    SessionEventType.QueueAutoDrainChanged,
    this.sessionId,
    { autoDrain: options.autoDrain },
    { traceId: options.traceContext.traceId },
  );
  await this.appendEvent(event, options.traceContext);
}

export function completeExternalQueueDrain(this: AgentRuntimeInternal): void {
  this.queueExternalDrainActive = false;
}

export async function setFollowupMode(
  this: AgentRuntimeInternal,
  options: { mode: "queue" | "guide"; traceContext: TraceContext },
): Promise<void> {
  const event = createSessionEvent(
    SessionEventType.FollowupModeChanged,
    this.sessionId,
    { mode: options.mode },
    { traceId: options.traceContext.traceId },
  );
  await this.appendEvent(event, options.traceContext);
}

export async function emitModelSelected(
  this: AgentRuntimeInternal,
  options: {
    modelSelection: ModelSelection;
    model?: import("../deps.js").Model;
    effectiveReasoningLevel?: string;
    previousModelSelection?: ModelSelection | null;
    origin?: ModelSelectionOrigin;
    supportedThoughtLevels?: readonly string[];
    traceContext: TraceContext;
  },
): Promise<void> {
  const model = options.model ?? createRuntimeModel(this, { selection: options.modelSelection });
  const event = createSessionEvent(
    SessionEventType.ModelSelected,
    this.sessionId,
    {
      contextWindow: model.properties.contextWindow,
      modelSelection: cloneModelSelection(options.modelSelection),
      ...(options.effectiveReasoningLevel
        ? { effectiveReasoningLevel: options.effectiveReasoningLevel }
        : {}),
      ...(options.previousModelSelection !== undefined
        ? {
            previousModelSelection: options.previousModelSelection
              ? cloneModelSelection(options.previousModelSelection)
              : null,
          }
        : {}),
      ...(options.origin ? { origin: options.origin } : {}),
      ...(options.supportedThoughtLevels
        ? { supportedThoughtLevels: [...options.supportedThoughtLevels] }
        : {}),
    },
    { traceId: options.traceContext.traceId },
  );
  await this.appendEvent(event, options.traceContext);
}

export async function emitModeChanged(
  this: AgentRuntimeInternal,
  options: { mode: CollaborationMode; previousMode: CollaborationMode; traceContext: TraceContext },
): Promise<void> {
  const event = createSessionEvent(
    SessionEventType.ModeChanged,
    this.sessionId,
    {
      mode: this.getMode(),
      planEnabled: this.getPlanEnabled(),
      previousMode: options.previousMode,
      source: "command",
    },
    { traceId: options.traceContext.traceId },
  );
  await this.appendEvent(event, options.traceContext);
}
