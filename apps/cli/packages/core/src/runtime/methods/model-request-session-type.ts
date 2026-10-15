// SPDX-License-Identifier: Apache-2.0
// 模型请求的会话归类入口：分类表在 support/session-type-table.ts，这里保持兼容导出面。
import {
  ModelRequestSessionType,
  ModelRetryBudget,
  type SessionTaskType,
} from "@knorvia/contracts";
import { classifyTaskType } from "./support/session-type-table.js";

export function resolveModelRequestSessionTypeFromTaskType(
  taskType: SessionTaskType | undefined,
): ModelRequestSessionType {
  return classifyTaskType(taskType).requestType;
}

export function resolveModelRetryBudgetFromTaskType(
  taskType: SessionTaskType | undefined,
): ModelRetryBudget {
  return classifyTaskType(taskType).retryBudget;
}
