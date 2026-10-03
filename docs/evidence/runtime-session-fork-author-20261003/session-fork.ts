import { createMessageId, createPartId, SessionEventType, RewindStrategy,
  traceContextToLogContext, type MessageId, type MessageWithParts, type SessionId, type TraceContext } from '../deps.js';
import { formatConversationForkNoticeBody } from '../helpers/index.js';
import type { AgentRuntimeInternal } from '../internal.js';
import type { StableConversationForkOptions, ConversationBeforeInputForkOptions,
  SelectionSideChatCreateOptions, WorkspaceForkResult } from '../types.js';
import { atomicFork } from './session-fork-atomic.js';
import { copyGoalStateForFork } from './session-fork-legacy-goal.js';
import { createForkedSession, legacyParentMissing, requireLegacyStore } from './session-fork-session.js';
import { buildForkHistoryMessages, forkSourceMessagesForSession, historyBeforeInput,
  resolveForkHistoryEndIndex, stableForkError, stableForkHistory } from './session-fork-transcript.js';

export { createForkedSession, copyGoalStateForFork, forkSourceMessagesForSession,
  resolveForkHistoryEndIndex, buildForkHistoryMessages };

export async function forkStableConversationAtMessage(this: AgentRuntimeInternal, options: StableConversationForkOptions): Promise<WorkspaceForkResult> {
  if (!options.sourceCommandId.trim()) throw stableForkError('Stable fork sourceCommandId must not be empty');
  if (!this.sessionStore?.commitForkBundle) throw stableForkError('Stable fork requires commitForkBundle');
  const parentSession = await this.sessionStore.getSession(this.sessionId);
  if (!parentSession) throw stableForkError(`Session not found: ${this.sessionId}`);
  const parentMessages = await this.sessionStore.messages({ sessionID: this.sessionId });
  const source = forkSourceMessagesForSession(parentMessages, parentSession);
  const history = stableForkHistory(source, options.target);
  return await atomicFork(this, {
    modelSelection: options.modelSelection, forkedSessionId: options.forkedSessionId,
    goalBoundary: options.goalBoundary, messages: history, parentSession,
    revisionAtDecision: options.revisionAtDecision, sourceCommandId: options.sourceCommandId,
    target: options.target, targetMessageId: options.target.boundaryMessageId as MessageId,
    traceContext: options.traceContext ?? this.rootTraceContext,
  });
}

export async function forkConversationBeforeMessage(this: AgentRuntimeInternal, options: ConversationBeforeInputForkOptions): Promise<WorkspaceForkResult> {
  if (!this.sessionStore?.commitForkBundle) throw stableForkError('Fork requires a session adapter');
  const parentSession = await this.sessionStore.getSession(this.sessionId);
  if (!parentSession) throw stableForkError(`Session not found: ${this.sessionId}`);
  const parentMessages = await this.sessionStore.messages({ sessionID: this.sessionId });
  const source = forkSourceMessagesForSession(parentMessages, parentSession);
  const history = historyBeforeInput(source, options.targetMessageId);
  return await atomicFork(this, {
    commandFact: options.commandFact, modelSelection: options.modelSelection,
    forkedSessionId: options.forkedSessionId, goalBoundary: options.goalBoundary,
    initialInput: options.initialInput, messages: history, parentSession,
    sourceCommandId: options.sourceCommandId, targetMessageId: options.targetMessageId,
    traceContext: options.traceContext ?? this.rootTraceContext,
  });
}

export async function createSelectionSideConversation(this: AgentRuntimeInternal, options: SelectionSideChatCreateOptions): Promise<WorkspaceForkResult> {
  if (!options.sourceCommandId.trim()) throw stableForkError('Selection side chat sourceCommandId must not be empty');
  if (!this.sessionStore?.commitForkBundle) throw stableForkError('Selection side chat requires commitForkBundle');
  const parentSession = await this.sessionStore.getSession(this.sessionId);
  if (!parentSession) throw stableForkError(`Session not found: ${this.sessionId}`);
  const parentMessages = await this.sessionStore.messages({ sessionID: this.sessionId });
  const source = forkSourceMessagesForSession(parentMessages, parentSession);
  const activeTurnId = this.activeTurn?.turnId;
  let history: MessageWithParts[];
  if (!activeTurnId) history = [...source];
  else {
    const userIndex = source.findIndex(message => message.info.role === 'user'
      && message.info.anchor?.turnId === activeTurnId && message.info.anchor.origin === 'realUser');
    if (userIndex >= 0) history = source.slice(0, userIndex + 1);
    else {
      const turnIndex = source.findIndex(message => message.info.anchor?.turnId === activeTurnId);
      history = turnIndex >= 0 ? source.slice(0, turnIndex) : [...source];
    }
  }
  const targetMessageId = history[history.length - 1]?.info.id ?? createMessageId();
  return await atomicFork(this, {
    modelSelection: options.modelSelection, goalBoundary: { kind: 'none' },
    kind: 'selection_side_chat', messages: history, parentSession,
    revisionAtDecision: options.revisionAtDecision, sourceCommandId: options.sourceCommandId,
    targetMessageId, traceContext: options.traceContext ?? this.rootTraceContext,
  });
}

export async function forkConversationFromMessage(this: AgentRuntimeInternal, options: {
  forkedSessionId?: SessionId; targetMessageId: MessageId; traceContext: TraceContext; beforeTarget?: true;
}): Promise<WorkspaceForkResult> {
  requireLegacyStore(this);
  const parentSession = await this.sessionStore!.getSession(this.sessionId);
  if (!parentSession) throw legacyParentMissing(this.sessionId);
  const parentMessages = await this.sessionStore!.messages({ sessionID: this.sessionId });
  const source = forkSourceMessagesForSession(parentMessages, parentSession);
  const targetIndex = source.findIndex(message => message.info.id === options.targetMessageId);
  if (targetIndex < 0) throw stableForkError(`Fork target message not found in session store: ${options.targetMessageId}`, {
    messageId: options.targetMessageId,
  });
  const end = resolveForkHistoryEndIndex(source, targetIndex, true);
  const history = options.beforeTarget ? historyBeforeInput(source, options.targetMessageId)
    : buildForkHistoryMessages(parentMessages, source, targetIndex, end);
  const forkedSessionId = await createForkedSession(this, { forkedSessionId: options.forkedSessionId, parentSession });
  const { copiedMessageCount, messageIdMap } = await this.copySessionMessagesForFork({
    forkedSessionId, messages: history, traceContext: options.traceContext,
  });
  await copyGoalStateForFork.call(this, { forkedSessionId, messageIdMap, traceContext: options.traceContext });
  const copiedTarget = messageIdMap.get(options.targetMessageId);
  const created = Date.now();
  await this.persistAssistantTimelinePartForSession({
    sessionId: forkedSessionId, messageID: createMessageId(),
    partID: createPartId(`fork_${String(this.sessionId)}_${String(options.targetMessageId)}_timeline`),
    parentID: copiedTarget, created, completed: created, finish: 'completed',
    timeline: { timelineType: 'session_fork', display: 'separator', status: 'completed',
      anchorMessageId: copiedTarget, parentSessionId: this.sessionId, targetMessageId: options.targetMessageId,
      restoredFileCount: 0, time: { start: created, end: created } },
    traceContext: options.traceContext,
  });
  await this.persistSyntheticUserNoticeForSession({
    messageID: createMessageId(), sessionId: forkedSessionId, source: 'fork',
    text: formatConversationForkNoticeBody({ parentSessionId: this.sessionId, targetMessageId: options.targetMessageId }),
    metadata: { forkContext: { kind: 'session_fork', parentSessionId: this.sessionId,
      targetMessageId: options.targetMessageId, restoredFileCount: 0 } }, traceContext: options.traceContext,
  });
  this.logger?.debug('Conversation fork notice persisted', {
    ...traceContextToLogContext(options.traceContext), event: 'session.fork.notice.persisted',
    forkedSessionId, module: 'core.runtime', parentSessionId: this.sessionId,
    status: 'completed', targetMessageId: options.targetMessageId,
  });
  const event = this.createEvent(SessionEventType.SessionForked, {
    originalSessionId: this.sessionId, forkedSessionId, forkPoint: end,
    targetMessageId: options.targetMessageId, restoredFileCount: 0, strategy: RewindStrategy.ForkRequired,
  }, options.traceContext);
  await this.appendEvent(event, options.traceContext);
  return { copiedMessageCount, forkedSessionId, parentSessionId: this.sessionId,
    targetMessageId: options.targetMessageId, restoredFiles: [],
    response: `Forked session ${forkedSessionId} from message ${options.targetMessageId}: copied ${copiedMessageCount} messages.` };
}
