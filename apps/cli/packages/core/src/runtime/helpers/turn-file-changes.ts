// SPDX-License-Identifier: Apache-2.0
// 回合文件变更汇总的兼容面（B23）：实现见 ./session/turn-file-diff.js。
import * as diff from "./session/turn-file-diff.js";

export const recordTurnFileChange = diff.recordTurnFileChange;
export const buildTurnFileChangeSummary = diff.buildTurnFileChangeSummary;
