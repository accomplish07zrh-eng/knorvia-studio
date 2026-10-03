import {
  SessionEventType,
  traceContextToLogContext,
  type MessageId,
  type TraceContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { AgentTelemetryCausation } from "@knorvia/contracts";
import {
  persistFallbackGoalSummaryTitle,
  persistGeneratedGoalSummaryTitle,
} from "./goal-summary-title.js";
import {
  SESSION_TITLE_QUERY_SOURCE,
  generateTitleCandidate,
  normalizeTitleInput,
} from "./title-generation-sidecar.js";

type StoredSession = NonNullable<Awaited<ReturnType<
  NonNullable<AgentRuntimeInternal["sessionStore"]>["getSession"]
>>>;
type TitleCandidate = NonNullable<Awaited<ReturnType<typeof generateTitleCandidate>>>;
type TitleSeedOptions = {
  bypassShortInputGuard?: boolean;
  deferIfProviderRuntimeHeadersRefresh?: boolean;
  goalSummaryTargetID?: string;
  messageID?: MessageId;
  traceContext: TraceContext;
};
const GENERATED_TITLE_SOURCES = ["default", "first_input", "generated"] as const;

export function maybeStartSessionTitleGeneration(
  this: AgentRuntimeInternal,
  input: string,
  messageID: MessageId,
  traceContext: TraceContext,
  options?: {
    deferIfProviderRuntimeHeadersRefresh?: boolean;
    goalSummaryTargetID?: string;
  },
): boolean {
  return startTitleSeed.call(this, input, {
    deferIfProviderRuntimeHeadersRefresh: options?.deferIfProviderRuntimeHeadersRefresh,
    goalSummaryTargetID: options?.goalSummaryTargetID,
    messageID,
    traceContext,
  });
}

export function maybeStartDeferredSessionTitleGeneration(
  this: AgentRuntimeInternal,
  input: string,
  messageID: MessageId,
  traceContext: TraceContext,
): boolean {
  return startTitleSeed.call(this, input, { messageID, traceContext });
}

export function maybeStartSessionTitleGenerationFromExternalInput(
  this: AgentRuntimeInternal,
  input: string,
  options?: { goalSummaryTargetID?: string; traceContext?: TraceContext },
): void {
  startTitleSeed.call(this, input, {
    bypassShortInputGuard: true,
    goalSummaryTargetID: options?.goalSummaryTargetID,
    traceContext: options?.traceContext ?? this.rootTraceContext,
  });
}

function startTitleSeed(
  this: AgentRuntimeInternal,
  input: string,
  options: TitleSeedOptions,
): boolean {
  if (this.sessionTitleGenerationAttempted) return false;
  if (this.config.titleGeneration?.enabled === false) return false;
  if (!this.config.titleGeneration) return false;
  if (!this.sessionStore) return false;
  if (this.config.parentSessionId) return false;
  if (this.config.taskType && this.config.taskType !== "interactive") return false;
  if (this.turnNumber !== 0) return false;

  const normalized = normalizeTitleInput(input);
  if (!normalized) return false;
  if (!(options.bypassShortInputGuard || Array.from(normalized).length >= 10)) return false;
  if (options.deferIfProviderRuntimeHeadersRefresh && shouldDeferTitleSeed.call(this)) return false;

  this.sessionTitleGenerationAttempted = true;
  const causation = this.agentTelemetry.captureCausation();
  const work = generateSessionTitle.call(this, input, options, causation).catch(async (error) => {
    this.logger?.warn("Session title generation failed", {
      ...traceContextToLogContext(options.traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "session_title_generation.failed",
      module: "core.runtime",
      status: "failed",
    });
    if (options.goalSummaryTargetID) {
      await persistFallbackGoalSummaryTitle.call(this, {
        objective: input,
        reason: "session_title_generation_failed",
        targetID: options.goalSummaryTargetID,
        traceContext: options.traceContext,
      });
    }
  });
  this.trackResidencyBlockingWork(work);
  void work.catch((error) => {
    this.logger?.warn("Session title fallback persistence failed", {
      ...traceContextToLogContext(options.traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "session_title_generation.fallback_failed",
      module: "core.runtime",
      status: "failed",
    });
  });
  return true;
}

function shouldDeferTitleSeed(this: AgentRuntimeInternal): boolean {
  const port = this.providerRuntimeHeadersPort;
  if (!port) return false;
  const selection = this.config.titleGeneration!.modelSelection ?? this.getSessionModelSelection();
  if (!selection) return true;
  return port.shouldRefreshBeforeModelRequest?.({
    providerId: selection.providerId,
    modelId: selection.modelId,
  }) ?? true;
}

async function generateSessionTitle(
  this: AgentRuntimeInternal,
  input: string,
  options: TitleSeedOptions,
  causation: AgentTelemetryCausation | undefined,
): Promise<void> {
  const session = await this.sessionStore?.getSession(this.sessionId);
  if (!session || session.parentID || session.taskType !== "interactive") return;
  if (await skipEditedTitle.call(this, session, options.messageID, options.traceContext)) return;

  const shouldPersist = session.titleSource !== "custom";
  if (!shouldPersist && !options.goalSummaryTargetID) {
    logTitleSkip.call(this, options.traceContext, "custom_title");
    return;
  }
  if (options.goalSummaryTargetID) {
    this.logger?.info("Goal summary title generation started", {
      ...traceContextToLogContext(options.traceContext),
      event: "goal_summary_title_generation.started",
      module: "core.runtime",
      querySource: SESSION_TITLE_QUERY_SOURCE,
      status: "started",
      targetId: options.goalSummaryTargetID,
    });
  }
  const generated = await generateTitleCandidate.call(this, input, {
    causation,
    messageID: options.messageID,
    querySource: SESSION_TITLE_QUERY_SOURCE,
    traceContext: options.traceContext,
  });
  if (!generated) {
    if (options.goalSummaryTargetID) {
      await persistFallbackGoalSummaryTitle.call(this, {
        objective: input,
        reason: "session_title_empty",
        targetID: options.goalSummaryTargetID,
        traceContext: options.traceContext,
      });
    }
    return;
  }
  if (shouldPersist) {
    await writeGeneratedTitle.call(this, {
      messageID: options.messageID,
      modelSelection: generated.modelSelection,
      title: generated.title,
      traceContext: generated.traceContext,
    });
  }
  if (options.goalSummaryTargetID) {
    await persistGeneratedGoalSummaryTitle.call(this, {
      targetID: options.goalSummaryTargetID,
      title: generated.title,
      traceContext: generated.traceContext,
    });
  }
}

async function writeGeneratedTitle(
  this: AgentRuntimeInternal,
  input: {
    messageID?: MessageId;
    modelSelection: TitleCandidate["modelSelection"];
    title: string;
    traceContext: TraceContext;
  },
): Promise<void> {
  const session = await sessionForTitleWrite.call(this, input.messageID, input.traceContext);
  if (!session) return;
  if (session.titleSource === "custom") {
    logTitleSkip.call(this, input.traceContext, "custom_title");
    return;
  }
  const previousTitle = session.title;
  const updated = await this.sessionStore?.updateSession({
    expectedTitleSources: GENERATED_TITLE_SOURCES,
    id: this.sessionId,
    title: input.title,
    ...(input.messageID ? { titleMessageID: input.messageID } : {}),
    titleSource: "generated",
  });
  if (!updated || updated.title !== input.title || updated.titleSource !== "generated") {
    logTitleSkip.call(this, input.traceContext, "title_source_changed");
    return;
  }
  await this.appendEvent(this.createEvent(SessionEventType.SessionTitleUpdated, {
    ...(input.messageID ? { messageID: input.messageID } : {}),
    previousTitle,
    source: "generated",
    title: input.title,
  }, input.traceContext), input.traceContext);
}

async function sessionForTitleWrite(
  this: AgentRuntimeInternal,
  messageID: MessageId | undefined,
  traceContext: TraceContext,
): Promise<StoredSession | null> {
  const session = await this.sessionStore?.getSession(this.sessionId);
  if (!session || session.parentID || session.taskType !== "interactive") return null;
  if (await skipEditedTitle.call(this, session, messageID, traceContext)) return null;
  return session;
}

async function skipEditedTitle(
  this: AgentRuntimeInternal,
  session: StoredSession,
  messageID: MessageId | undefined,
  traceContext: TraceContext,
): Promise<boolean> {
  if (!(await titleSuppressed.call(this, session, messageID))) return false;
  logTitleSkip.call(this, traceContext, "first_query_edited");
  return true;
}

async function titleSuppressed(
  this: AgentRuntimeInternal,
  session: StoredSession,
  messageID: MessageId | undefined,
): Promise<boolean> {
  if (messageID && session.revert?.targetMessageID === messageID) return true;
  return editedFirstVisibleQuery.call(this, session);
}

async function editedFirstVisibleQuery(
  this: AgentRuntimeInternal,
  session: StoredSession,
): Promise<boolean> {
  if (session.revert?.kind !== "conversation_rewind" || !session.revert.targetMessageID) return false;
  const kept = new Set(session.revert.keptMessageIDs ?? []);
  if (kept.size === 0) return true;
  const messages = await this.sessionStore?.messages({ sessionID: this.sessionId });
  if (!messages) return false;
  return !messages.some((entry) =>
    kept.has(entry.info.id) &&
    entry.info.role === "user" &&
    entry.info.synthetic !== true &&
    entry.info.visibility !== "model-only"
  );
}

function logTitleSkip(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
  reason: "custom_title" | "title_source_changed" | "first_query_edited",
): void {
  this.logger?.debug("Session title generation skipped", {
    ...traceContextToLogContext(traceContext),
    event: "session_title_generation.skipped",
    module: "core.runtime",
    reason,
  });
}

export async function setCustomSessionTitle(
  this: AgentRuntimeInternal,
  input: { title: string; traceContext: TraceContext },
): Promise<void> {
  const session = await this.sessionStore?.getSession(this.sessionId);
  const previousTitle = session?.title ?? "";
  await this.sessionStore?.updateSession({
    id: this.sessionId,
    title: input.title,
    titleSource: "custom",
  });
  await this.appendEvent(this.createEvent(SessionEventType.SessionTitleUpdated, {
    previousTitle,
    source: "custom",
    title: input.title,
  }, input.traceContext), input.traceContext);
}
