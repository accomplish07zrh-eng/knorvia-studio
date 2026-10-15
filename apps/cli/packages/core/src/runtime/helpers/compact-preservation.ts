// SPDX-License-Identifier: Apache-2.0
// 压缩保留区间选择的兼容面（B27）：实现见 ./compact/preserved-tail.js。
import * as tail from "./compact/preserved-tail.js";

export const selectPersistedCompactTail = tail.selectPersistedCompactTail;
export const countCompactPreservedRuntimeMessages = tail.countCompactPreservedRuntimeMessages;
