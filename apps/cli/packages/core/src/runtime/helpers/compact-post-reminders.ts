// SPDX-License-Identifier: Apache-2.0
// 压缩后读取状态提醒的兼容面（B21）：实现见 ./runtime-reminders/read-state-replay.js。
import * as replay from "./runtime-reminders/read-state-replay.js";

export const buildPostCompactReadStateReminderEntries =
  replay.buildPostCompactReadStateReminderEntries;
