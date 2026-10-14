// SPDX-License-Identifier: Apache-2.0
// 执行器装配的兼容面：实现见 ./internal/tool-executor.js。
// 模块路径、类名与工厂函数名保持不变；装配字段的形状由 interface.md 固定。
import * as executor from "./internal/tool-executor.js";

export const ToolExecutorImpl = executor.ToolExecutorImpl;
export type ToolExecutorImpl = executor.ToolExecutorImpl;
export const createToolExecutor = executor.createToolExecutor;
