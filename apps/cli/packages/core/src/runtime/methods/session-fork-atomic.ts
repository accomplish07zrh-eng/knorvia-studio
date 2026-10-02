import { type ForkCommitBundle, type ModelSelection } from "@knorvia/contracts";
import { resolveExecutionState } from "@knorvia/shared";
import {
  createSessionId,
  SESSION_ENTRY_MODEL_SELECTION,
  SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION,
  SessionEventType,
  RewindStrategy,
  traceContextToLogContext,
  type MessageId,
  type MessageWithParts,
  type SessionId,
  type SessionInfo,
  type TraceContext,
} from "../deps.js";
import { buildExecutionStateEntry, readRuntimeExecutionState } from "../execution-state.js";
import { cloneMessageForFork, clonePartForFork } from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { cloneModelSelection } from "../model-selection.js";
import type {
  StableConversationForkGoalBoundary,
  StableConversationForkTarget,
  WorkspaceForkResult,
} from "../types.js";
import {
  allocateForkIdentities,
  goalSnapshotsForFork,
  referencedVerifierIds,
  requiredMapping,
} from "./session-fork-identities.js";
import { forkNotices, selectionSideBoundary } from "./session-fork-notices.js";
import { childSessionInput, selectForkModel } from "./session-fork-session.js";
import { stableForkError } from "./session-fork-transcript.js";
import { cloneAtomicVerifier, selectAtomicVerifiers } from "./session-fork-verifiers.js";

export interface AtomicForkOptions {
  commandFact?: ForkCommitBundle["commandFact"];
  modelSelection?: ModelSelection;
  forkedSessionId?: SessionId;
  goalBoundary: StableConversationForkGoalBoundary;
  initialInput?: ForkCommitBundle["initialInput"];
  kind?: "fork" | "selection_side_chat";
  messages: MessageWithParts[];
  parentSession: SessionInfo;
  revisionAtDecision?: number;
  sourceCommandId: string;
  target?: StableConversationForkTarget;
  targetMessageId: MessageId;
  traceContext: TraceContext;
}

export async function atomicFork(
  runtime: AgentRuntimeInternal,
  options: AtomicForkOptions,
): Promise<WorkspaceForkResult> {
  const store = runtime.sessionStore;
  if (!store?.commitForkBundle) throw stableForkError("Stable fork requires commitForkBundle");
  const requestedChildId = options.forkedSessionId ?? createSessionId();
  const kind = options.kind ?? "fork";
  const currentExecutionState = readRuntimeExecutionState(runtime);
  const historicalInfo = [...options.messages]
    .reverse()
    .find((message) => message.info.role === "assistant")?.info;
  const executionState =
    kind === "selection_side_chat" || historicalInfo?.role !== "assistant"
      ? currentExecutionState
      : resolveExecutionState(historicalInfo);
  const sourceMessages =
    kind === "selection_side_chat"
      ? options.messages.map((message) => {
          if (!message.info.anchor?.goalBoundary) return message;
          const anchor = { ...message.info.anchor };
          delete anchor.goalBoundary;
          return { ...message, info: { ...message.info, anchor } };
        })
      : options.messages;
  const selection = selectForkModel(runtime, sourceMessages, options.modelSelection);
  const verifierIds =
    kind === "selection_side_chat"
      ? new Set<string>()
      : referencedVerifierIds(sourceMessages, options.goalBoundary);
  const loadedEntries = verifierIds.size
    ? await store.sessionEntries?.({
        sessionID: runtime.sessionId,
        type: SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION,
      })
    : [];
  const verifierEntries = selectAtomicVerifiers(loadedEntries, verifierIds);
  const goalSnapshots =
    kind === "selection_side_chat"
      ? []
      : goalSnapshotsForFork(sourceMessages, options.goalBoundary);
  const identities = allocateForkIdentities(sourceMessages, goalSnapshots, verifierEntries);
  const copiedMessages = sourceMessages.map((message) => {
    const nextMessageId = identities.messageIdMap.get(message.info.id)!;
    const cloned = cloneMessageForFork(message.info, {
      forkedSessionId: requestedChildId,
      messageIdMap: identities.messageIdMap,
      nextMessageId,
      turnIdMap: identities.turnIdMap,
      productTurnIdMap: identities.productTurnIdMap,
      targetIdMap: identities.targetIdMap,
      verificationEntryIdMap: identities.verificationEntryIdMap,
      strictLocalReferences: true,
    });
    const parts = message.parts.map((part) =>
      clonePartForFork(part, {
        forkedSessionId: requestedChildId,
        nextMessageId,
        nextPartId: identities.partIdMap.get(part.id),
        partIdMap: identities.partIdMap,
        messageIdMap: identities.messageIdMap,
        turnIdMap: identities.turnIdMap,
        targetIdMap: identities.targetIdMap,
        verificationIdMap: identities.verificationIdMap,
        toolCallIdMap: identities.toolCallIdMap,
        strictLocalReferences: true,
      }),
    );
    const info =
      kind === "selection_side_chat"
        ? {
            ...cloned,
            visibility: "model-only",
            semantics: {
              origin: cloned.semantics?.origin ?? "migration",
              kind: cloned.semantics?.kind ?? "system_reminder",
              ...(cloned.semantics?.source ? { source: cloned.semantics.source } : {}),
              uiVisibility: "hidden",
              providerVisibility: "visible",
              transcriptVisibility: "hidden",
            },
          }
        : cloned;
    return { info, parts } as MessageWithParts;
  });
  const clonedVerifiers = verifierEntries.map((entry) =>
    cloneAtomicVerifier(entry, requestedChildId, identities),
  );
  const modelCreated = Date.now();
  const modelSelectionEntry = {
    id: `${requestedChildId}:runtime-model-selection`,
    sessionID: requestedChildId,
    type: SESSION_ENTRY_MODEL_SELECTION,
    touchSession: false,
    time: { created: modelCreated, updated: modelCreated },
    data: selection ? cloneModelSelection(selection) : null,
  };
  const notices =
    kind === "selection_side_chat"
      ? [selectionSideBoundary(runtime, requestedChildId, selection)]
      : forkNotices(runtime, {
          forkedSessionId: requestedChildId,
          targetMessageId: options.targetMessageId,
          sourceCommandId: options.sourceCommandId,
          selection,
          executionState,
          identities,
        });
  const commandFact = options.commandFact ?? {
    parentSessionId: String(runtime.sessionId),
    sourceCommandId: options.sourceCommandId,
    ack: {
      commandId: options.sourceCommandId,
      status: "accepted",
      revisionAtDecision: options.revisionAtDecision ?? 0,
      result: {
        type: kind === "selection_side_chat" ? "createSelectionSideSession" : "forkAssistant",
        sessionId: String(requestedChildId),
      },
    },
    metadata: {
      forkOrigin: {
        parentSessionId: String(runtime.sessionId),
        targetMessageId: String(options.targetMessageId),
      },
      ...(options.target ? { forkTarget: options.target } : {}),
    },
  };
  const goal =
    kind !== "selection_side_chat" && options.goalBoundary.kind === "snapshot"
      ? {
          source: {
            ...options.goalBoundary.target,
            sessionID: requestedChildId,
            targetID: requiredMapping(
              identities.targetIdMap,
              options.goalBoundary.target.targetID,
              "goal target",
            ),
            activeInputId: null,
            activeRunStartedAtMs: null,
            activeRunLastSeenAtMs: null,
          },
          status: options.goalBoundary.target.status,
        }
      : undefined;
  const committedChild = await store.commitForkBundle({
    child: childSessionInput(runtime, options.parentSession, requestedChildId, kind),
    messages: [...copiedMessages, ...notices],
    copySources: {
      messages: Object.fromEntries(
        [...identities.messageIdMap].map(([source, target]) => [target, source]),
      ),
      parts: Object.fromEntries(
        [...identities.partIdMap].map(([source, target]) => [target, source]),
      ),
    },
    entries: [
      ...clonedVerifiers.map((clone) => clone.entry),
      modelSelectionEntry,
      buildExecutionStateEntry(requestedChildId, executionState),
    ],
    ...(goal ? { goal } : {}),
    ...(options.initialInput ? { initialInput: options.initialInput } : {}),
    commandFact,
  } as ForkCommitBundle);
  const forkedSessionId = committedChild.id;
  if (kind !== "selection_side_chat") {
    const event = runtime.createEvent(
      SessionEventType.SessionForked,
      {
        originalSessionId: runtime.sessionId,
        forkedSessionId,
        forkPoint: options.messages.length,
        targetMessageId: options.targetMessageId,
        restoredFileCount: 0,
        strategy: RewindStrategy.ForkRequired,
      },
      options.traceContext,
    );
    try {
      await runtime.appendEvent(event, options.traceContext);
    } catch (error) {
      runtime.logger?.warn("Parent fork event append failed after durable fork commit", {
        ...traceContextToLogContext(options.traceContext),
        error: error instanceof Error ? error.message : String(error),
        event: "session.fork.parent_event.failed_after_commit",
        forkedSessionId,
        module: "core.runtime",
        parentSessionId: runtime.sessionId,
      });
    }
  }
  return {
    copiedMessageCount: options.messages.length,
    forkedSessionId,
    parentSessionId: runtime.sessionId,
    targetMessageId: options.targetMessageId,
    restoredFiles: [],
    response:
      kind === "selection_side_chat"
        ? `Created selection side chat ${forkedSessionId}.`
        : `Forked session ${forkedSessionId} from message ${options.targetMessageId}: copied ${options.messages.length} messages.`,
  };
}
