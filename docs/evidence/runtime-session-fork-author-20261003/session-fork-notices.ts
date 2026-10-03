import { createModelId, createModelProviderId, type ModelSelection } from '@knorvia/contracts';
import type { ExecutionState } from '@knorvia/shared';
import { systemReminderRuntimeMetadata } from '../../agent/message-history.js';
import { createMessageId, createPartId, createTurnId, type MessageId, type MessageWithParts, type SessionId } from '../deps.js';
import { readRuntimeExecutionState } from '../execution-state.js';
import { emptyTokenUsageInfo, formatConversationForkNoticeBody } from '../helpers/index.js';
import type { AgentRuntimeInternal } from '../internal.js';
import { cloneModelSelection } from '../model-selection.js';
import { buildSyntheticUserNoticePartMetadata } from './synthetic-notice-metadata.js';
import type { ForkIdentities } from './session-fork-identities.js';

export function forkNotices(runtime: AgentRuntimeInternal, options: {
  forkedSessionId: SessionId; targetMessageId: MessageId; sourceCommandId: string;
  selection?: ModelSelection; executionState?: ExecutionState; identities: ForkIdentities;
}): MessageWithParts[] {
  const created = Date.now();
  const ids = options.identities;
  const copiedAnchor = ids.messageIdMap.get(options.targetMessageId) ?? ids.hiddenMessageId;
  const anchor = { turnId: ids.noticeTurnId, productTurnId: ids.noticeProductTurnId,
    orderedMessageIds: [ids.hiddenMessageId, ids.noticeMessageId], boundaryMessageId: ids.noticeMessageId };
  const forkOrigin = { parentSessionId: runtime.sessionId, targetMessageId: options.targetMessageId };
  const runtimeSelection = runtime.getSessionModelSelection();
  const selection = options.selection ?? runtimeSelection;
  const agent = runtime.config.agentName ?? 'agent';
  return [{
    info: {
      id: ids.hiddenMessageId, sessionID: options.forkedSessionId, role: 'user', time: { created }, agent,
      modelSelection: selection && cloneModelSelection(selection), synthetic: true, source: 'fork', visibility: 'model-only',
      semantics: { origin: 'system', kind: 'fork_notice', uiVisibility: 'hidden', providerVisibility: 'visible', transcriptVisibility: 'hidden' },
      anchor, metadata: { forkOrigin },
    },
    parts: [{ id: ids.hiddenPartId, sessionID: options.forkedSessionId, messageID: ids.hiddenMessageId,
      type: 'text', text: formatConversationForkNoticeBody(forkOrigin), synthetic: true,
      time: { start: created, end: created }, metadata: buildSyntheticUserNoticePartMetadata('fork', 'model-only', {
        forkOrigin, runtimeMessage: systemReminderRuntimeMetadata('conversation_fork'),
      }) }],
  }, {
    info: {
      id: ids.noticeMessageId, sessionID: options.forkedSessionId, role: 'assistant', time: { created, completed: created },
      parentID: ids.hiddenMessageId, modelId: selection && createModelId(selection.modelId),
      providerId: selection && createModelProviderId(selection.providerId),
      ...(selection?.options?.reasoningLevel ? { reasoningLevel: selection.options.reasoningLevel } : {}),
      ...(options.executionState ?? readRuntimeExecutionState(runtime)), agent,
      path: { cwd: runtime.workingDirectory, root: runtime.workspaceRoot }, cost: 0, tokens: emptyTokenUsageInfo(), finish: 'completed',
      semantics: { origin: 'system', kind: 'timeline_event', uiVisibility: 'visible', providerVisibility: 'hidden', transcriptVisibility: 'visible' },
      anchor, metadata: { forkOrigin },
    },
    parts: [{ id: ids.noticePartId, sessionID: options.forkedSessionId, messageID: ids.noticeMessageId,
      type: 'timeline', timelineType: 'session_fork', display: 'separator', status: 'completed',
      anchorMessageId: copiedAnchor, anchorTurnId: ids.noticeTurnId, sourceCommandId: options.sourceCommandId,
      parentSessionId: runtime.sessionId, targetMessageId: options.targetMessageId, restoredFileCount: 0,
      time: { start: created, end: created } }],
  }] as MessageWithParts[];
}

export function selectionSideBoundary(runtime: AgentRuntimeInternal, forkedSessionId: SessionId, selection?: ModelSelection): MessageWithParts {
  const created = Date.now();
  const messageId = createMessageId();
  const turnId = createTurnId();
  return {
    info: { id: messageId, sessionID: forkedSessionId, role: 'user', time: { created },
      agent: runtime.config.agentName ?? 'agent', modelSelection: selection && cloneModelSelection(selection),
      synthetic: true, source: 'selection_side_chat', visibility: 'model-only',
      semantics: { origin: 'system', kind: 'system_reminder', source: 'selection_side_chat', uiVisibility: 'hidden', providerVisibility: 'visible', transcriptVisibility: 'hidden' },
      anchor: { turnId, productTurnId: String(messageId), orderedMessageIds: [messageId], boundaryMessageId: messageId, origin: 'synthetic' },
    },
    parts: [{ id: createPartId(), sessionID: forkedSessionId, messageID: messageId, type: 'text',
      text: [
        'The preceding conversation was inherited from the parent task for reference only.',
        "Do not continue the parent's active work automatically; answer only new questions sent in this side chat.",
        'Modify the workspace only when the user explicitly asks you to do so in this side chat.',
      ].join(' '), synthetic: true, time: { start: created, end: created },
      metadata: buildSyntheticUserNoticePartMetadata('selection_side_chat', 'model-only', undefined) }],
  } as MessageWithParts;
}
