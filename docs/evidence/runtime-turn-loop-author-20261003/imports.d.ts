import { beginLocalTurnPreparation } from "@knorvia/contracts";
import { CompactPhase, CompactReason, createMessageId, traceContextToLogContext, TurnMachineImpl, } from "../deps.js";
import { buildRuntimeModeReminderBody, buildPlanModeExitReminderBody, buildRuntimeOutputStyleReminderBody, buildTodoReminderBody, buildRuntimeProviderRequestMessages, createCompactRapidRefillError, throwIfTurnAborted, shouldBuildTodoReminder, } from "../helpers/index.js";
import { systemReminderAttachmentEntry, todoReminderRuntimeMetadata, } from "../../agent/message-history.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { runModelBackedTurnStep } from "./turn-model-step.js";
import { AUTOMATION_MUTATION_TOOL_NAMES, evaluateRapidRefill, isAutomationMutationRestrictedTurn, isOffPeakCreateRestrictedTurn, MAX_CONSECUTIVE_RAPID_REFILLS, OFF_PEAK_MUTATION_TOOL_NAMES, RAPID_REFILL_TOOL_TURN_THRESHOLD, recordCompactHistoryRound, recordCompactSuccess, } from "./turn-loop-state.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import { appendTurnRequestEntries, commitTurnRequestEntries, filterOutputTokenContinuationEntries, } from "./turn-output-token-continuation.js";
