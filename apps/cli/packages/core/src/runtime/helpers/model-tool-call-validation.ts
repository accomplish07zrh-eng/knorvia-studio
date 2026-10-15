// SPDX-License-Identifier: Apache-2.0
// 模型工具调用名校验的兼容面（B32）：实现见 ./turn/tool-call-name-guard.js。
import * as guard from "./turn/tool-call-name-guard.js";

export const normalizeModelToolCallsForRuntime = guard.normalizeModelToolCallsForRuntime;
export const requireRuntimeToolCallName = guard.requireRuntimeToolCallName;
