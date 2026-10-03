import {
  SessionEventType,
  createChildTraceContext,
  createMessageId,
  createPartId,
  createTurnId,
} from "../deps.js";
import type {
  MessageId,
  SyntheticUserMessageSource,
  TraceContext,
  TurnInputIntentMetadata,
  WorkflowLaunchMeta,
} from "../deps.js";
import { buildUserContentFromTurn } from "../helpers/index.js";
import { realUserRuntimeMetadata } from "../../agent/message-history.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { ControlOnlyTurnRuntimeCommand } from "../command-queue.js";
import { buildProjectionAnchor } from "./projection-anchor.js";
import { maybeStartGoalSummaryTitleGeneration } from "./goal-summary-title.js";
import { maybeStartSessionTitleGeneration } from "./session-title.js";

// Publish the boundary only after history and message persistence have completed.
export async function emitControlOnlyUserTurn(
  this: AgentRuntimeInternal,
  options: {
    messageId: MessageId;
    titleInput: string;
    historyText: string;
    turnInput: string;
    traceContext: TraceContext;
    inputId?: string;
    inputSource?: SyntheticUserMessageSource;
    workflowLaunch?: WorkflowLaunchMeta;
    intent?: TurnInputIntentMetadata;
    persistMessage: () => Promise<void>;
    afterTurnBoundary?: () => void;
  },
): Promise<void> {
  const messageId = options.messageId;
  const traceContext = options.traceContext;

  await this.ensureContextInitialized(traceContext);
  await this.ensureSessionPersisted(options.titleInput, traceContext);
  this.messageHistory.addUser(
    buildUserContentFromTurn(options.historyText, []),
    realUserRuntimeMetadata(),
  );
  await options.persistMessage();

  const turnId = createTurnId();
  const turnTraceContext = createChildTraceContext(traceContext, {
    turnId,
    attributes: { turnNumber: this.turnNumber },
  });
  await this.appendEvent(
    this.createEvent(
      SessionEventType.TurnStarted,
      {
        turnNumber: this.turnNumber,
        input: options.turnInput,
        messageId,
        ...(options.inputId ? { inputId: options.inputId } : {}),
        executionKind: "controlOnly",
        ...(options.inputSource ? { inputSource: options.inputSource } : {}),
        ...(options.workflowLaunch ? { workflowLaunch: options.workflowLaunch } : {}),
        ...(options.intent ? { intent: options.intent } : {}),
      },
      turnTraceContext,
    ),
    turnTraceContext,
  );
  await this.appendEvent(
    this.createEvent(
      SessionEventType.TurnComplete,
      {
        response: "",
        tokenCount: 0,
        toolCallCount: 0,
        duration: 0,
        resultType: "success",
        ...(options.inputId ? { inputId: options.inputId } : {}),
      },
      turnTraceContext,
    ),
    turnTraceContext,
  );

  options.afterTurnBoundary?.();
  this.turnNumber += 1;
  this.messageHistory.setCacheMiss();
}

// Adapt a queued workflow launch without snapshotting its persistence inputs.
export async function runControlOnlyTurnCommand(
  this: AgentRuntimeInternal,
  command: ControlOnlyTurnRuntimeCommand,
): Promise<void> {
  const messageId = createMessageId();
  await emitControlOnlyUserTurn.call(this, {
    messageId,
    titleInput: command.titleInput,
    historyText: command.text,
    turnInput: command.text,
    traceContext: command.traceContext,
    ...(command.inputId !== undefined ? { inputId: command.inputId } : {}),
    inputSource: "workflow_launch",
    workflowLaunch: command.workflowLaunch,
    persistMessage: () =>
      persistWorkflowLaunchUserMessage.call(this, {
        messageID: messageId,
        text: command.text,
        meta: command.workflowLaunch,
        traceContext: command.traceContext,
      }),
  });
}

// Title generation starts synchronously at the completed turn boundary.
export async function recordExternalUserPrompt(
  this: AgentRuntimeInternal,
  input: string,
  options?: {
    goalSummaryTargetID?: string;
    traceContext?: TraceContext;
    intent?: TurnInputIntentMetadata;
  },
): Promise<MessageId> {
  const traceContext = options?.traceContext ?? this.rootTraceContext;
  const canonicalInput = options?.intent?.text?.trim() || input;
  const messageId = createMessageId();
  await emitControlOnlyUserTurn.call(this, {
    messageId,
    titleInput: canonicalInput,
    historyText: input,
    turnInput: input,
    traceContext,
    inputId: options?.intent?.sourceCommandId,
    intent: options?.intent,
    persistMessage: () =>
      this.persistUserPrompt(messageId, input, undefined, traceContext, {
        intent: options?.intent,
        sessionInputId: options?.intent?.queueItemId,
        executionKind: "controlOnly",
      }),
    afterTurnBoundary: () => {
      const startedSessionTitle = maybeStartSessionTitleGeneration.call(
        this,
        canonicalInput,
        messageId,
        traceContext,
        { goalSummaryTargetID: options?.goalSummaryTargetID },
      );
      if (!startedSessionTitle && options?.goalSummaryTargetID) {
        maybeStartGoalSummaryTitleGeneration.call(
          this,
          canonicalInput,
          options.goalSummaryTargetID,
          { traceContext },
        );
      }
    },
  });
  return messageId;
}

// A workflow launch uses one timestamp for its message and text part.
export async function persistWorkflowLaunchUserMessage(
  this: AgentRuntimeInternal,
  options: {
    messageID: MessageId;
    text: string;
    meta: WorkflowLaunchMeta;
    traceContext: TraceContext;
  },
): Promise<void> {
  this.latestConversationMessageId = options.messageID;
  if (!this.sessionStore) return;

  const created = Date.now();
  await this.persistMessage(
    {
      id: options.messageID,
      sessionID: this.sessionId,
      role: "user",
      time: { created },
      agent: this.config.agentName ?? "agent",
      metadata: { workflowLaunch: options.meta },
      modelSelection: this.getSessionModelSelection(),
      semantics: {
        origin: "real_user",
        kind: "user_prompt",
        source: "workflow_launch",
        uiVisibility: "visible",
        providerVisibility: "visible",
        transcriptVisibility: "visible",
      },
      anchor: buildProjectionAnchor(options.traceContext, "realUser"),
      source: "workflow_launch",
      system: this.config.systemPrompt,
      synthetic: true,
      tools: Object.fromEntries(this.getTools().map((tool) => [tool.name, true])),
      visibility: "user-visible",
    },
    options.traceContext,
  );
  await this.persistPart(
    {
      id: createPartId(),
      sessionID: this.sessionId,
      messageID: options.messageID,
      type: "text",
      text: options.text,
      synthetic: true,
      time: { start: created, end: created },
      metadata: { source: "workflow_launch", visibility: "user-visible" },
    },
    options.traceContext,
  );
}
