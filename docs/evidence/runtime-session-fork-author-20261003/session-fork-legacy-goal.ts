import { traceContextToLogContext, type MessageId, type SessionId, type TraceContext } from '../deps.js';
import type { AgentRuntimeInternal } from '../internal.js';
import type { StableConversationForkGoalBoundary } from '../types.js';
import { stableForkError } from './session-fork-transcript.js';
import { copyLegacyVerifiers } from './session-fork-verifiers.js';

export async function copyGoalStateForFork(this: AgentRuntimeInternal, options: {
  forkedSessionId: SessionId; goalBoundary?: StableConversationForkGoalBoundary;
  messageIdMap: Map<MessageId, MessageId>; traceContext: TraceContext;
}): Promise<void> {
  const store = this.sessionStore;
  if (!store?.cloneTargetForFork) return;
  if (options.goalBoundary?.kind === 'none') return;
  const snapshot = options.goalBoundary?.kind === 'snapshot' ? options.goalBoundary : undefined;
  const parentTarget = snapshot ? snapshot.target : await store.readTarget({ sessionID: this.sessionId });
  if (!parentTarget) return;
  if (snapshot && String(parentTarget.sessionID) !== String(this.sessionId)) {
    throw stableForkError('Stable fork goal snapshot belongs to another session', {
      goalSessionId: parentTarget.sessionID, parentSessionId: this.sessionId,
    });
  }
  const copied = await copyLegacyVerifiers(store, {
    forkedSessionId: options.forkedSessionId, messageIdMap: options.messageIdMap,
    parentSessionId: this.sessionId, parentTargetId: parentTarget.targetID,
    ...(snapshot ? { verificationEntryIds: new Set(snapshot.verificationEntryIds) } : {}),
  });
  const lastCompleted = [...copied].reverse().find(payload => payload.status === 'completed' && payload.verification);
  const status = snapshot ? parentTarget.status : lastCompleted?.verification?.passed === true
    ? 'complete' : parentTarget.status === 'complete' ? 'active' : parentTarget.status;
  await store.cloneTargetForFork({ sessionID: options.forkedSessionId, source: parentTarget, status });
  this.logger?.debug('Forked session goal state copied', {
    ...traceContextToLogContext(options.traceContext), copiedGoalVerificationCount: copied.length,
    event: 'session.fork.goal_state.copied', forkedSessionId: options.forkedSessionId,
    module: 'core.runtime', parentSessionId: this.sessionId, targetId: parentTarget.targetID,
  });
}
