// SPDX-License-Identifier: Apache-2.0
// 模型异常告警的兼容面（B31）：实现见 ./turn/model-anomaly-warnings.js。
import * as anomaly from "./turn/model-anomaly-warnings.js";

export const detectRepeatedToolCallWarnings = anomaly.detectRepeatedToolCallWarnings;
export const detectToolCallBudgetWarning = anomaly.detectToolCallBudgetWarning;
export const buildRepeatedToolCallReminderBody = anomaly.buildRepeatedToolCallReminderBody;
export const buildToolCallBudgetReminderBody = anomaly.buildToolCallBudgetReminderBody;
