import { RewindScope, RewindStrategy } from "../deps.js";
import type { MessageId, SessionEvent, TraceContext } from "../deps.js";
import { selectCheckpointForMessage } from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { ConversationRewindResult, WorkspaceRewindResult } from "../types.js";
import {
  applyConversationRewind,
  planConversationRewind,
  unavailableConversationRewind,
} from "./rewind-conversation-state.js";
import { rewindWorkspaceCascadeToMessage } from "./rewind-workspace-cascade.js";

export async function rewindToMessage(
  this: AgentRuntimeInternal,
  options: {
    abortSignal?: AbortSignal;
    events: SessionEvent[];
    scope: RewindScope;
    targetMessageId: MessageId;
    traceContext: TraceContext;
  },
): Promise<ConversationRewindResult | WorkspaceRewindResult> {
  if (options.scope === RewindScope.Workspace) return this.rewindWorkspaceToMessage(options);
  if (options.scope === RewindScope.Both) {
    const workspace = await this.rewindWorkspaceToMessage(options);
    if (workspace.strategy !== RewindStrategy.ActiveChain) return workspace;
    const conversation = await this.rewindConversationToMessage(options);
    return { ...conversation, response: `${workspace.response}\n${conversation.response}` };
  }
  return this.rewindConversationToMessage(options);
}

export async function rewindCascadeToMessage(
  this: AgentRuntimeInternal,
  options: {
    abortSignal?: AbortSignal;
    events: SessionEvent[];
    scope: RewindScope;
    targetMessageId: MessageId;
    traceContext: TraceContext;
  },
): Promise<ConversationRewindResult | WorkspaceRewindResult> {
  if (options.scope === RewindScope.Workspace)
    return rewindWorkspaceCascadeToMessage.call(this, options);
  if (options.scope === RewindScope.Both) {
    const plan = await planConversationRewind.call(this, {
      targetMessageId: options.targetMessageId,
    });
    if (plan.kind === "unavailable")
      return unavailableConversationRewind(plan, options.targetMessageId);
    const workspace = await rewindWorkspaceCascadeToMessage.call(this, options);
    if (workspace.strategy !== RewindStrategy.ActiveChain) return workspace;
    const conversation = await applyConversationRewind.call(this, {
      abortSignal: options.abortSignal,
      events: options.events,
      plan,
      targetMessageId: options.targetMessageId,
      traceContext: options.traceContext,
    });
    return { ...conversation, response: `${workspace.response}\n${conversation.response}` };
  }
  return this.rewindConversationToMessage(options);
}

export async function rewindWorkspaceToMessage(
  this: AgentRuntimeInternal,
  options: {
    abortSignal?: AbortSignal;
    events: SessionEvent[];
    scope: RewindScope;
    targetMessageId: MessageId;
    traceContext: TraceContext;
  },
): Promise<WorkspaceRewindResult> {
  const persistedEvents = await this.eventStore.getEvents(this.sessionId);
  const checkpoint = selectCheckpointForMessage(persistedEvents, options.targetMessageId);
  if (!checkpoint) {
    return this.finishUnavailableRewind({
      events: options.events,
      reason: "target_checkpoint_not_found",
      rewindId: `rewind_${crypto.randomUUID()}`,
      scope: options.scope,
      targetMessageId: options.targetMessageId,
      traceContext: options.traceContext,
    });
  }
  return this.rewindWorkspaceToCheckpoint({
    abortSignal: options.abortSignal,
    events: options.events,
    targetCheckpointId: checkpoint.checkpointId,
    traceContext: options.traceContext,
  });
}

export async function rewindConversationToMessage(
  this: AgentRuntimeInternal,
  options: {
    abortSignal?: AbortSignal;
    events: SessionEvent[];
    scope?: RewindScope;
    targetMessageId: MessageId;
    traceContext: TraceContext;
  },
): Promise<ConversationRewindResult> {
  const plan = await planConversationRewind.call(this, {
    targetMessageId: options.targetMessageId,
    remapAssistantAnchor: options.scope === undefined || options.scope === RewindScope.Conversation,
  });
  if (plan.kind === "unavailable")
    return unavailableConversationRewind(plan, options.targetMessageId);
  return applyConversationRewind.call(this, {
    abortSignal: options.abortSignal,
    events: options.events,
    plan,
    targetMessageId: options.targetMessageId,
    traceContext: options.traceContext,
  });
}
