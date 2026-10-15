// SPDX-License-Identifier: Apache-2.0
// 压缩触发/重建/微压缩的兼容面与桶再导出面（B24–B25 + 邻接再导出）：实现见 ./compact/*.js。
import * as triggers from "./compact/trigger-mapping.js";
import * as assembly from "./compact/history-assembly.js";
import * as microcompact from "./compact/micro-compact-application.js";
import * as selection from "./compact/entry-selection.js";
import * as retry from "./compact/prompt-too-long-retry.js";
import * as tail from "./compact/preserved-tail.js";
import * as replay from "./runtime-reminders/read-state-replay.js";

export const buildPostCompactReadStateReminderEntries =
  replay.buildPostCompactReadStateReminderEntries;
export const defaultCompactPhaseForTrigger = triggers.defaultCompactPhaseForTrigger;
export const countCompactPreservedRuntimeMessages = tail.countCompactPreservedRuntimeMessages;
export const defaultCompactReasonForTrigger = triggers.defaultCompactReasonForTrigger;
export const compactFailureReasonFromError = triggers.compactFailureReasonFromError;
export const buildPostCompactRuntimeEntries = assembly.buildPostCompactRuntimeEntries;
export const selectCompactEntries = selection.selectCompactEntries;
export const maybeLocalMicrocompactRuntimeEntries =
  microcompact.maybeLocalMicrocompactRuntimeEntries;
export const getRuntimeEntriesToSummarize = selection.getRuntimeEntriesToSummarize;
export const hasEnoughRuntimeEntriesToCompact = selection.hasEnoughRuntimeEntriesToCompact;
export const estimateRuntimeEntryTokens = selection.estimateRuntimeEntryTokens;
export const selectCompactEntriesAfterPromptTooLong = retry.selectCompactEntriesAfterPromptTooLong;
export const selectCompactEntriesForInitialPromptTooLong =
  retry.selectCompactEntriesForInitialPromptTooLong;
export const truncateCompactSummaryRequestEntriesAfterPromptTooLong =
  retry.truncateCompactSummaryRequestEntriesAfterPromptTooLong;
