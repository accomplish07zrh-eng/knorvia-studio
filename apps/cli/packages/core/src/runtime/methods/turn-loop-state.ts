// SPDX-License-Identifier: Apache-2.0
export {
  AUTOMATION_MUTATION_TOOL_NAMES,
  MAX_CONSECUTIVE_RAPID_REFILLS,
  OFF_PEAK_MUTATION_TOOL_NAMES,
  RAPID_REFILL_TOOL_TURN_THRESHOLD,
  evaluateRapidRefill,
  isAutomationMutationRestrictedTurn,
  isOffPeakCreateRestrictedTurn,
  recordCompactHistoryRound,
  recordCompactSuccess,
  recordCompletedToolBatch,
  recordModelHistoryRound,
} from "./support/m02-loop-state.js";
export type {
  AutoCompactLoopContext,
  AutoCompactOutcome,
  CompactAttemptOutcome,
  CompactLoopTracking,
  PendingStreamRecoveryRequest,
  RapidRefillDecision,
  ReactiveCompactLoopContext,
  RegularTurnLoopState,
  TurnRequestState,
} from "./support/m02-loop-state.js";
