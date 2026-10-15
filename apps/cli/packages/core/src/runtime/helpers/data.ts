// SPDX-License-Identifier: Apache-2.0
// 数据守卫工具的兼容面（B40/B41 共用）：实现见 ./session/identity-and-guards.js。
import * as guards from "./session/identity-and-guards.js";

export const isRuntimeDiffHunk = guards.isRuntimeDiffHunk;
export const isPlainRecord = guards.isPlainRecord;
export const objectKeys = guards.objectKeys;
export const stringProperty = guards.stringProperty;
