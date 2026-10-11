// SPDX-License-Identifier: Apache-2.0
// 读取状态快照查询的兼容面：实现见 ./internal/read-state-query.js。
// 模块路径与导出名保持不变，调用方不需要知道实现搬到了哪里。
import * as query from "./internal/read-state-query.js";

export const createReadFileStateKey = query.createReadFileStateKey;
export const normalizeReadFileStateMtimeMs = query.normalizeReadFileStateMtimeMs;
export const findLatestReadFileState = query.findLatestReadFileState;
export const findEditableReadFileState = query.findEditableReadFileState;
