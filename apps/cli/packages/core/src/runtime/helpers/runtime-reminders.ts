// SPDX-License-Identifier: Apache-2.0
// 运行时提醒正文族的兼容面（B20）：实现见 ./runtime-reminders/prompt-builders.js。
import * as prompts from "./runtime-reminders/prompt-builders.js";

export const buildDateChangeReminderBody = prompts.buildDateChangeReminderBody;
export const runtimeMetadataForSyntheticUserMessageSource =
  prompts.runtimeMetadataForSyntheticUserMessageSource;
export const shouldBuildTodoReminder = prompts.shouldBuildTodoReminder;
export const buildTodoReminderBody = prompts.buildTodoReminderBody;
export const buildRuntimeModeReminderBody = prompts.buildRuntimeModeReminderBody;
export const buildPlanModeExitReminderBody = prompts.buildPlanModeExitReminderBody;
export const buildRuntimeOutputStyleReminderBody = prompts.buildRuntimeOutputStyleReminderBody;
