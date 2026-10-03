import { beginLocalTurnPreparation } from "@knorvia/contracts";
import {
  CompactPhase,
  CompactReason,
  createMessageId,
  traceContextToLogContext,
  TurnMachineImpl,
} from "../deps.js";
import {
  buildRuntimeModeReminderBody,
  buildPlanModeExitReminderBody,
  buildRuntimeOutputStyleReminderBody,
  buildTodoReminderBody,
  buildRuntimeProviderRequestMessages,
  createCompactRapidRefillError,
  throwIfTurnAborted,
  shouldBuildTodoReminder,
} from "../helpers/index.js";
import {
  systemReminderAttachmentEntry,
  todoReminderRuntimeMetadata,
} from "../../agent/message-history.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { runModelBackedTurnStep } from "./turn-model-step.js";
import {
  AUTOMATION_MUTATION_TOOL_NAMES,
  evaluateRapidRefill,
  isAutomationMutationRestrictedTurn,
  isOffPeakCreateRestrictedTurn,
  MAX_CONSECUTIVE_RAPID_REFILLS,
  OFF_PEAK_MUTATION_TOOL_NAMES,
  RAPID_REFILL_TOOL_TURN_THRESHOLD,
  recordCompactHistoryRound,
  recordCompactSuccess,
} from "./turn-loop-state.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import {
  appendTurnRequestEntries,
  commitTurnRequestEntries,
  filterOutputTokenContinuationEntries,
} from "./turn-output-token-continuation.js";

/** Prepares model requests and delegates their progression to the model step owner. */
export async function runRegularTurnLoop(
  this: AgentRuntimeInternal,
  state: RegularTurnLoopState,
): Promise<void> {
  while (true) {
    throwIfTurnAborted(state.turnAbortSignal);
    const recoveryActive = state.turnRequestState.outputTokenContinuationCount > 0;
    const drainedSteerForNextRequest = state.drainedSteerForNextRequest;
    state.drainedSteerForNextRequest = undefined;

    if (state.modelStepCount > 0 && !recoveryActive) {
      const drained = await this.drainPendingRuntimeCommandsForActiveLoop();
      state.backgroundSubagentResultConsumed ||= drained.backgroundSubagentResultConsumed;
      state.workflowResultConsumed ||= drained.workflowResultConsumed;
      appendTurnRequestEntries(state.turnRequestState, drained.runtimeEntries);
      if (drained.drained > 0) {
        state.repeatedToolCallSignature = undefined;
        state.repeatedToolCallStreakCount = 0;
      }
    }

    const phase = state.modelStepCount === 0 ? CompactPhase.PreRequest : CompactPhase.MidTurn;
    await this.microcompactIfNeeded(state.turnTraceContext, state.events, state.turnAbortSignal, {
      model: state.model,
      modelStepIndex: state.modelStepCount,
      phase,
      turnRequestState: state.turnRequestState,
    });
    throwIfTurnAborted(state.turnAbortSignal);

    const rapidRefill = evaluateRapidRefill(state.compactTracking);
    const compactResult = await this.autoCompactIfNeeded(
      state.turnTraceContext,
      state.events,
      state.turnAbortSignal,
      {
        compactReason: CompactReason.ContextLimit,
        modelStepIndex: state.modelStepCount,
        phase,
        rapidRefill,
        model: state.model,
        turnRequestState: state.turnRequestState,
      },
    );
    if (compactResult === "rapid_refill_blocked") {
      throw createCompactRapidRefillError({
        consecutiveRapidRefills: rapidRefill.consecutiveRapidRefills,
        maxConsecutiveRapidRefills: MAX_CONSECUTIVE_RAPID_REFILLS,
        toolTurnThreshold: RAPID_REFILL_TOOL_TURN_THRESHOLD,
        toolTurnsSinceCompact: rapidRefill.toolTurnsSinceCompact,
      });
    }
    if (compactResult === "compacted") {
      recordCompactSuccess(state, rapidRefill);
      recordCompactHistoryRound(state);
    }
    throwIfTurnAborted(state.turnAbortSignal);

    const finishMcp = beginLocalTurnPreparation(state.turnTraceContext, "mcp");
    await this.initializeMcp(state.turnTraceContext);
    finishMcp();
    throwIfTurnAborted(state.turnAbortSignal);

    const finishTools = beginLocalTurnPreparation(state.turnTraceContext, "tools");
    const disallowedNames = new Set(state.toolDisallowlist ?? []);
    if (isAutomationMutationRestrictedTurn(state)) {
      for (const name of AUTOMATION_MUTATION_TOOL_NAMES) disallowedNames.add(name);
    }
    if (isOffPeakCreateRestrictedTurn(state)) {
      for (const name of OFF_PEAK_MUTATION_TOOL_NAMES) disallowedNames.add(name);
    }
    const disallowed = disallowedNames.size > 0 ? disallowedNames : null;
    const tools = state.automationCreateLimitReached
      ? []
      : disallowed
        ? this.getTools(state.model).filter((tool) => !disallowed.has(tool.name))
        : this.getTools(state.model);
    finishTools();

    if (!recoveryActive && this.needsPlanModeExitReminder) {
      this.needsPlanModeExitReminder = false;
      commitTurnRequestEntries(this, state.turnRequestState, [
        systemReminderAttachmentEntry("plan_mode_exit", buildPlanModeExitReminderBody()),
      ]);
    }
    const runtimeModeBody = recoveryActive
      ? null
      : buildRuntimeModeReminderBody(
          state.turnRequestState.entries,
          this.getMode(),
          this.getPlanEnabled(),
        );
    if (runtimeModeBody) {
      commitTurnRequestEntries(this, state.turnRequestState, [
        systemReminderAttachmentEntry("runtime_mode", runtimeModeBody),
      ]);
    }

    if (
      !recoveryActive &&
      tools.some((tool) => tool.name === "TodoWrite") &&
      shouldBuildTodoReminder(state.turnRequestState.entries)
    ) {
      const todos = await this.readSessionTodosForContext(state.turnTraceContext);
      const todoBody = buildTodoReminderBody(todos);
      commitTurnRequestEntries(this, state.turnRequestState, [
        systemReminderAttachmentEntry("todo_reminder", todoBody),
      ]);
      await this.persistSyntheticUserNoticeForSession({
        messageID: createMessageId(),
        metadata: { runtimeMessage: todoReminderRuntimeMetadata() },
        sessionId: this.sessionId,
        source: "todo_reminder",
        text: todoBody,
        traceContext: state.turnTraceContext,
      });
    }

    const outputStyleBody =
      state.modelStepCount === 0
        ? buildRuntimeOutputStyleReminderBody(state.turnOutputStyle)
        : null;
    if (outputStyleBody) {
      commitTurnRequestEntries(this, state.turnRequestState, [
        systemReminderAttachmentEntry("output_style", outputStyleBody),
      ]);
    }

    const requestEntries = [...state.turnRequestState.entries];
    const providerProjection = buildRuntimeProviderRequestMessages(this, {
      entries: requestEntries,
      applyCacheControl: true,
      model: state.model,
    });
    const messages = providerProjection.messages;
    const recordableEntries = filterOutputTokenContinuationEntries(requestEntries);
    const recordableProjection =
      recordableEntries === requestEntries
        ? providerProjection
        : buildRuntimeProviderRequestMessages(this, {
            entries: recordableEntries,
            applyCacheControl: true,
            model: state.model,
          });

    state.turnMachine = new TurnMachineImpl(
      state.turnMachine.startModelRequest(
        `${state.model.providerId}/${state.model.modelId}`,
        recordableProjection.messages,
      ),
    );
    this.logger?.info("Model request started", {
      ...traceContextToLogContext(state.turnTraceContext),
      event: "model.request.started",
      module: "core.runtime",
      status: "started",
      messageCount: messages.length,
      iteration: state.toolCallCount === 0 ? 0 : Math.ceil(state.toolCallCount / 10),
    });
    const result = await runModelBackedTurnStep.call(this, state, {
      drainedSteerForNextRequest,
      latestRealUserMessageIndex: providerProjection.diagnostics.latestRealUserMessageIndex,
      messages,
      sourceEntries: providerProjection.sourceEntries,
      requestEntries,
      recordedMessages: recordableProjection.messages,
      tools,
    });
    if (result === "break") return;
  }
}
