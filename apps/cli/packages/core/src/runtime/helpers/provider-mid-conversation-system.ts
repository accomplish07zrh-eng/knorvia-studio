// SPDX-License-Identifier: Apache-2.0
// 中途系统提醒投影的兼容面（B36）：实现见 ./provider/mid-conversation-system.js。
import * as midSystem from "./provider/mid-conversation-system.js";

export type ProjectedRuntimeMessageEntry = midSystem.ProjectedRuntimeMessageEntry;
export const projectMidConversationSystemEntries = midSystem.projectMidConversationSystemEntries;
export const moveLegacySystemRemindersAfterToolResultRun =
  midSystem.moveLegacySystemRemindersAfterToolResultRun;
export const isToolResultUserMessage = midSystem.isToolResultUserMessage;
