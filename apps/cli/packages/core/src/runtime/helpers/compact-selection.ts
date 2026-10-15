// SPDX-License-Identifier: Apache-2.0
// 压缩条目选择与超长重试的兼容面（B26）：实现见 ./compact/entry-selection.js 与
// ./compact/prompt-too-long-retry.js。
import * as selection from "./compact/entry-selection.js";
import * as retry from "./compact/prompt-too-long-retry.js";

export type CompactEntrySelection = selection.CompactEntrySelection;
export const selectCompactEntries = selection.selectCompactEntries;
export const getRuntimeEntriesToSummarize = selection.getRuntimeEntriesToSummarize;
export const hasEnoughRuntimeEntriesToCompact = selection.hasEnoughRuntimeEntriesToCompact;
export const estimateRuntimeEntryTokens = selection.estimateRuntimeEntryTokens;
export const selectCompactEntriesAfterPromptTooLong = retry.selectCompactEntriesAfterPromptTooLong;
export const selectCompactEntriesForInitialPromptTooLong =
  retry.selectCompactEntriesForInitialPromptTooLong;
export const truncateCompactSummaryRequestEntriesAfterPromptTooLong =
  retry.truncateCompactSummaryRequestEntriesAfterPromptTooLong;
