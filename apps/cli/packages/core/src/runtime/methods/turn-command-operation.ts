import { beginLocalTurnPreparation } from "@knorvia/contracts";
import {
  CoreErrorType,
  HookEventName,
  type HookRunResult,
  TurnMachineImpl,
  createMessageId,
  createModelUsageSummaryFromEvents,
} from "../deps.js";
import {
  appendTurnOutcomeEvent,
  createTurnFailureError,
  logResolvedTurnAttachments,
  resolveTurnAttachments,
  throwIfTurnAborted,
} from "../helpers/index.js";
import type { TurnResult } from "../types.js";
import { applySubmissionExecutionState, createTurnModel } from "./turn-model.js";
import { rebuildContextPrefix } from "./context-refresh.js";
import { runRegularTurnLoop } from "./turn-loop.js";
import {
  maybeStartDeferredSessionTitleGeneration,
  maybeStartSessionTitleGeneration,
} from "./session-title.js";
import { finishOutputTokenRecovery } from "./turn-output-token-continuation.js";
import { recordTurnUsageFact } from "./usage-observability.js";
import { persistStableForkCompletionBoundary } from "./stable-fork-boundary.js";
import {
  closeGoalStateChangeReminderDeferral,
  openGoalStateChangeReminderDeferral,
} from "./goal-state-reminder.js";
import { scheduleProjectMemoryExtraction } from "../helpers/project-memory-extraction.js";
import { appendBrowserTurnScreenshot } from "./browser-turn-screenshot.js";
import {
  addUserEntries,
  completedUsage,
  hookCompleteEvent,
  injectInputReminders,
  injectSharedContext,
  loopState,
  regularCompleteEvent,
  startedEvent,
  syntheticInput,
  syntheticNotice,
  targetCompletion,
  userPromptOptions,
} from "./turn-command-data.js";
import {
  completePhase,
  installHeartbeat,
  logTurnCompleted,
  logTurnStarted,
  startPhase,
  type TurnCommandLifetime,
} from "./turn-command-state.js";

export function createTurnCommandOperation(s: TurnCommandLifetime): () => Promise<TurnResult> {
  return async () => {
    const executionStartedAt = performance.timeOrigin + performance.now();
    beginLocalTurnPreparation(s.trace, "execution")();
    throwIfTurnAborted(s.signal);
    let admitted: ReturnType<typeof createTurnModel> | undefined;
    if (s.rewind === null) {
      try {
        admitted = createTurnModel(s.runtime, {
          requestDependencies: s.options?.modelExecution?.requestDependencies,
          selection: s.selection,
        });
      } catch (error) {
        s.handled = true;
        const coreError = createTurnFailureError(error, s.signal, "Model creation failed");
        await appendTurnOutcomeEvent(s.runtime, {
          coreError,
          events: s.events,
          durationMs: Date.now() - s.startedAt,
          turnPhase: "model_creation",
          inputId: s.options?.inputId,
          traceContext: s.trace,
          fallbackMessage: "Model creation failed",
          logEvent: "turn.failed",
          logLabel: "Turn",
        });
        throw coreError;
      }
    }
    const contextStart = startPhase(s, "context_initialization");
    if (s.runtime.contextInitialized) rebuildContextPrefix(s.runtime, { model: admitted });
    else await s.runtime.ensureContextInitialized(s.trace, admitted);
    completePhase(s, "context_initialization", contextStart);
    throwIfTurnAborted(s.signal);
    const sessionHooksStart = startPhase(s, "session_start_hooks");
    const sessionHooks = await s.runtime.runSessionStartHooks(
      "startup",
      s.trace,
      s.signal,
      admitted,
    );
    completePhase(s, "session_start_hooks", sessionHooksStart);
    s.runtime.injectHookAdditionalContextIntoMessageHistory(
      HookEventName.SessionStart,
      sessionHooks.additionalContexts,
    );
    if (s.compact !== null) {
      const model = await applySubmissionExecutionState(
        s.runtime,
        s.options?.intent,
        s.trace,
        s.options?.modelExecution,
        admitted,
      );
      return s.runtime.executeManualCompact(
        s.input,
        s.compact,
        s.turnId,
        s.trace,
        s.signal,
        s.options?.inputId,
        model,
      );
    }
    if (s.rewind !== null)
      return s.runtime.executeRewindCommand(
        s.input,
        s.rewind,
        s.turnId,
        s.trace,
        s.signal,
        s.options?.inputId,
      );
    s.activeTurn = s.runtime.beginActiveTurn(
      s.turnId,
      s.trace,
      "regular",
      true,
      s.options?.inputId !== undefined ? { inputId: s.options.inputId } : {},
    );
    logTurnStarted(s);
    s.machine = new TurnMachineImpl(s.machine.start());
    const persistenceStart = startPhase(s, "session_persistence");
    await s.runtime.ensureSessionPersisted(s.displayInput, s.trace);
    const submissionModel = await applySubmissionExecutionState(
      s.runtime,
      s.options?.intent,
      s.trace,
      s.options?.modelExecution,
      admitted,
    );
    const target = await s.runtime.readSessionTargetForContext(s.trace);
    completePhase(s, "target_read", persistenceStart);
    s.target = target?.status === "active" ? target : null;
    s.userMessageId =
      s.options?.skipInputRecord === true
        ? (s.options.recordedInputMessageId ?? createMessageId())
        : createMessageId();
    const turnStarted = startedEvent(s, executionStartedAt);
    const eventStart = startPhase(s, "turn_started_event");
    await s.runtime.appendEvent(turnStarted, s.trace);
    completePhase(s, "turn_started_event", eventStart);
    s.events.push(turnStarted);
    const accountingStart = startPhase(s, "target_accounting");
    s.target = await s.runtime.startTargetTurnAccounting({
      inputID: s.accountingInputId,
      startedAtMs: s.startedAt,
      startedTarget: s.target,
      traceContext: s.trace,
    });
    completePhase(s, "target_accounting", accountingStart);
    installHeartbeat(s);
    try {
      const promptHooksStart = startPhase(s, "user_prompt_hooks");
      const hooks: HookRunResult = s.options?.skipUserPromptSubmitHooks
        ? { additionalContexts: [] }
        : await s.runtime.runUserPromptSubmitHooks(s.input, s.attachments, s.trace, s.signal);
      completePhase(s, "user_prompt_hooks", promptHooksStart);
      if (hooks.preventContinuation) {
        const response = hooks.stopReason ?? "Prompt blocked by UserPromptSubmit hook.";
        if (s.activeTurn) s.activeTurn.steerable = false;
        s.machine = new TurnMachineImpl(s.machine.complete(response, "success"));
        const usage = createModelUsageSummaryFromEvents(s.events);
        const event = hookCompleteEvent(s, response, usage);
        await s.runtime.appendEvent(event, s.trace);
        s.events.push(event);
        await recordTurnUsageFact(s.runtime, completedUsage(s, s.startedAt, false));
        s.runtime.turnNumber++;
        const projection = await s.runtime.rebuildProjection();
        await s.runtime.accountTargetTurnCompletion(targetCompletion(s, usage));
        return {
          response,
          turnId: s.turnId,
          traceId: s.traceId,
          usage,
          events: s.events,
          projection,
        };
      }
      s.runtime.injectHookAdditionalContextIntoMessageHistory(
        HookEventName.UserPromptSubmit,
        hooks.additionalContexts,
      );
      injectInputReminders(s);
      const resolved = await resolveTurnAttachments(s.attachments, {
        abortSignal: s.signal,
        artifactStore: s.runtime.artifactStore,
        fileSystemPort: s.runtime.fileSystemPort,
        imageProcessorPort: s.runtime.imageProcessorPort,
        sessionId: s.runtime.sessionId,
        traceContext: s.trace,
        turnId: s.turnId,
        workingDirectory: s.runtime.workingDirectory,
      });
      logResolvedTurnAttachments(s.runtime.logger, s.trace, resolved);
      const refs = s.options?.sharedContextRefs ?? s.options?.intent?.sharedContextRefs;
      if (refs && refs.length > 0) {
        const reference = refs[0];
        if (!reference || reference.kind !== "shared_context_import")
          throw new Error("invalid shared context reference");
        if (!s.runtime.sessionStore)
          throw new Error("shared context import storage is unavailable");
        const hydrated = s.runtime.messageHistory
          .borrowReadOnlyRuntimeEntries()
          .some(
            (entry) => entry.kind !== "attachment" && entry.metadata?.source === "shared_context",
          );
        if (!hydrated) {
          const messages = await s.runtime.sessionStore.messages({
            sessionID: s.runtime.sessionId,
          });
          injectSharedContext(s, messages, reference);
        }
      }
      await s.runtime.persistPendingModelChangeTimeline(s.trace);
      if (s.options?.skipInputRecord !== true && s.options?.inputVisibility === "model-only") {
        const source = syntheticInput(s, resolved);
        await s.runtime.persistSyntheticUserNoticeForSession(syntheticNotice(s, source));
      } else if (s.options?.skipInputRecord !== true) {
        addUserEntries(s, resolved);
        await s.runtime.persistUserPrompt(
          s.userMessageId,
          s.displayInput,
          resolved,
          s.trace,
          userPromptOptions(s),
        );
        s.deferredTitle = !maybeStartSessionTitleGeneration.call(
          s.runtime,
          s.displayInput,
          s.userMessageId,
          s.trace,
          { deferIfProviderRuntimeHeadersRefresh: true },
        );
      }
      if (s.options?.inputVisibility !== "model-only")
        await s.runtime.injectPluginReferenceReminderFromTurn(
          s.displayInput,
          s.trace,
          s.options?.toolDisallowlist,
        );
      s.runtime.messageHistory.setCacheMiss();
      const model = submissionModel ?? admitted;
      if (!model) throw new Error("Turn model was not created before execution");
      s.loop = loopState(s, model);
      openGoalStateChangeReminderDeferral(s.activeTurn);
      const loopStart = startPhase(s, "regular_turn_loop");
      try {
        await runRegularTurnLoop.call(s.runtime, s.loop);
        completePhase(s, "regular_turn_loop", loopStart);
      } finally {
        finishOutputTokenRecovery(s.loop.turnRequestState);
        await closeGoalStateChangeReminderDeferral.call(s.runtime, s.activeTurn, s.trace);
      }
      s.machine = s.loop.turnMachine;
      const usage = createModelUsageSummaryFromEvents(s.events);
      await s.runtime.accountTargetTurnCompletion(targetCompletion(s, usage));
      if (s.loop.stableProductStartMessageId && s.loop.stableBoundaryAssistantMessageId) {
        await persistStableForkCompletionBoundary(s.runtime, {
          boundaryMessageId: s.loop.stableBoundaryAssistantMessageId,
          startMessageId: s.loop.stableProductStartMessageId,
          historyRoundCount: s.loop.historyRoundCount,
          traceContext: s.trace,
        });
      }
      if (s.loop.stableBoundaryAssistantMessageId)
        await appendBrowserTurnScreenshot(
          s.runtime,
          s.loop,
          s.loop.stableBoundaryAssistantMessageId,
        );
      const event = regularCompleteEvent(s, usage);
      await s.runtime.appendEvent(event, s.trace);
      s.events.push(event);
      await recordTurnUsageFact(s.runtime, completedUsage(s, s.startedAt, true));
      if (s.deferredTitle && s.userMessageId)
        maybeStartDeferredSessionTitleGeneration.call(
          s.runtime,
          s.displayInput,
          s.userMessageId,
          s.trace,
        );
      s.runtime.turnNumber++;
      const projection = await s.runtime.rebuildProjection();
      logTurnCompleted(s);
      if (s.options?.modelExecution?.memoryExtraction !== "skip")
        scheduleProjectMemoryExtraction(s.runtime, { model: s.loop.model, traceContext: s.trace });
      return {
        response: s.loop.modelResponse,
        turnId: s.turnId,
        traceId: s.traceId,
        usage,
        events: s.events,
        projection,
      };
    } catch (error) {
      s.handled = true;
      const coreError = createTurnFailureError(error, s.signal, "Turn execution failed");
      const preserveQueueAutoDrainOnCancel =
        coreError.type === CoreErrorType.TurnCancelled &&
        s.runtime.activeForegroundExecution?.preserveQueueAutoDrainOnCancel === true;
      const finished = await s.runtime.finishTargetTurnAccounting({
        endedAtMs: Date.now(),
        inputID: s.accountingInputId,
        startedTarget: s.target,
        status: coreError.type === CoreErrorType.TurnCancelled ? "paused" : undefined,
        traceContext: s.trace,
      });
      if (finished?.targetID === s.target?.targetID) s.target = finished;
      if (coreError.type === CoreErrorType.TurnCancelled) {
        await s.runtime.pauseActiveTargetForCancellation(s.trace);
        if (s.activeTurn)
          await s.runtime.fallbackPendingGuidesToQueue({
            activeTurn: s.activeTurn,
            events: s.events,
            reasonCode: "guide.turnInterrupted",
            traceContext: s.trace,
          });
      }
      if (s.activeTurn && coreError.type !== CoreErrorType.TurnCancelled) {
        const projection = await s.runtime.rebuildProjection();
        if (projection.pendingSteerInputs.length > 0) {
          s.runtime.queueAutoDrain = false;
          s.runtime.queueExternalDrainActive = false;
        }
      } else if (
        s.activeTurn &&
        coreError.type === CoreErrorType.TurnCancelled &&
        !preserveQueueAutoDrainOnCancel &&
        s.activeTurn.pendingInputs.length > 0
      ) {
        s.runtime.queueAutoDrain = false;
        s.runtime.queueExternalDrainActive = false;
      }
      const backgroundSubagentResultConsumed =
        s.options?.backgroundSubagentResultConsumed === true ||
        s.loop?.backgroundSubagentResultConsumed === true;
      const workflowResultConsumed =
        s.options?.workflowResultConsumed === true || s.loop?.workflowResultConsumed === true;
      await appendTurnOutcomeEvent(s.runtime, {
        coreError,
        events: s.events,
        durationMs: Date.now() - s.machine.state.startedAt.getTime(),
        turnPhase: s.machine.state.phase,
        inputId: s.options?.inputId,
        traceContext: s.trace,
        fallbackMessage: "Turn execution failed",
        logEvent: "turn.failed",
        logLabel: "Turn",
        preserveQueueAutoDrainOnCancel,
        backgroundSubagentResultConsumed,
        workflowResultConsumed,
        historyRoundCount: s.loop?.historyRoundCount,
      });
      await recordTurnUsageFact(s.runtime, {
        completedAt: Date.now(),
        error: coreError,
        events: s.events,
        startedAt: s.startedAt,
        status: coreError.type === CoreErrorType.TurnCancelled ? "cancelled" : "error",
        traceContext: s.trace,
        turnId: s.turnId,
        userMessageId: s.userMessageId,
      });
      throw coreError;
    }
  };
}
