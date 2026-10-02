import type { CreateSessionInput, ModelSelection } from '@knorvia/contracts';
import { createCoreError, CoreErrorType, createSessionId, type SessionId, type SessionInfo, type MessageWithParts } from '../deps.js';
import { buildExecutionStateEntry, readRuntimeExecutionState } from '../execution-state.js';
import { slugify } from '../helpers/index.js';
import type { AgentRuntimeInternal } from '../internal.js';
import { cloneModelSelection } from '../model-selection.js';
import type { StableConversationForkChildMetadata } from '../types.js';
import { stableForkError } from './session-fork-transcript.js';

export function requireLegacyStore(runtime: AgentRuntimeInternal): void {
  if (!runtime.sessionStore) throw createCoreError(CoreErrorType.ConfigurationError,
    'Fork requires a session adapter.', { context: { hasSessionStore: false }, recoverable: true });
}

export function legacyParentMissing(sessionId: SessionId) {
  return createCoreError(CoreErrorType.SessionNotFound, `Session not found: ${sessionId}`, {
    context: { sessionId }, recoverable: true,
  });
}

export function childSessionInput(runtime: AgentRuntimeInternal, parent: SessionInfo, id: SessionId, kind = 'fork'): CreateSessionInput {
  const now = Date.now();
  return {
    id, projectID: parent.projectID, workspaceID: parent.workspaceID,
    parentID: runtime.sessionId, traceID: runtime.rootTraceContext.traceId, taskType: kind,
    slug: `${slugify(parent.slug)}-${kind}-${now.toString(36)}`.slice(0, 120),
    directory: parent.directory, path: parent.path,
    title: kind === 'selection_side_chat' ? 'Selection side chat' : `Fork of ${parent.title}`,
    titleSource: 'generated', version: parent.version, permission: parent.permission,
    time: { created: now, updated: now },
  } as CreateSessionInput;
}

export async function createForkedSession(runtime: AgentRuntimeInternal, options: {
  parentSession: SessionInfo; forkedSessionId?: SessionId;
  stableForkMetadata?: StableConversationForkChildMetadata;
}): Promise<SessionId> {
  requireLegacyStore(runtime);
  const forkedSessionId = options.forkedSessionId ?? createSessionId();
  const input = childSessionInput(runtime, options.parentSession, forkedSessionId);
  if (options.stableForkMetadata) {
    if (!runtime.sessionStore!.createForkedSessionWithMetadata) {
      throw stableForkError('Stable fork requires atomic child metadata persistence', {
        forkedSessionId, sourceCommandId: options.stableForkMetadata.sourceCommandId,
      });
    }
    const persisted = await runtime.sessionStore!.createForkedSessionWithMetadata(input, options.stableForkMetadata);
    return persisted.id;
  }
  await runtime.sessionStore!.createSession(input);
  await runtime.sessionStore!.saveSessionEntry?.(buildExecutionStateEntry(forkedSessionId, readRuntimeExecutionState(runtime)));
  return forkedSessionId;
}

export function selectForkModel(runtime: AgentRuntimeInternal, messages: MessageWithParts[], explicit?: ModelSelection): ModelSelection | undefined {
  if (explicit) return cloneModelSelection(explicit);
  const historical = [...messages].reverse().map(message => {
    const info = message.info;
    if (info.role === 'user') return info.modelSelection ? cloneModelSelection(info.modelSelection) : undefined;
    if (!info.modelId || !info.providerId) return undefined;
    return { modelId: info.modelId, providerId: info.providerId,
      ...(info.reasoningLevel ? { options: { reasoningLevel: info.reasoningLevel } } : {}) };
  }).find(selection => Boolean(selection));
  const current = runtime.getSessionModelSelection();
  const identity = historical ?? current;
  if (!identity) return undefined;
  const reasoningLevel = historical?.options?.reasoningLevel ?? current?.options?.reasoningLevel;
  return { modelId: identity.modelId, providerId: identity.providerId,
    ...(reasoningLevel !== undefined ? { options: { reasoningLevel } } : {}) };
}
