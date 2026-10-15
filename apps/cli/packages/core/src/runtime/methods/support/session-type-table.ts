// SPDX-License-Identifier: Apache-2.0
// 任务类型归类表：模型请求的会话类型与重试预算都由这一张表回答。
// 服务端统计口径把 workflow 系子会话归「other」（它们不是 subagent），但重试预算放开——
// 模型错误不应当作 workflow 错误，runner 以最大努力恢复。
import {
  ModelRequestSessionType,
  ModelRetryBudget,
  type SessionTaskType,
} from "@knorvia/contracts";

/** 归类结果：请求会话类型 + 重试预算，一次查表同时得到。 */
export interface TaskClassification {
  requestType: ModelRequestSessionType;
  retryBudget: ModelRetryBudget;
}

/** workflow 演员族：显式子 workflow 与嵌套子 workflow 同口径。 */
const WORKFLOW_ACTORS: ReadonlySet<SessionTaskType> = new Set([
  "workflow_child",
  "nested_workflow_child",
]);

/** subagent 子会话：统计单列，预算仍沿用适配器默认。 */
const SUBAGENT_CHILDREN: ReadonlySet<SessionTaskType> = new Set(["subagent_child"]);

/** 查表归类：未知取值与缺省一律回主会话档（Main + Default）。 */
export const classifyTaskType = (taskType: SessionTaskType | undefined): TaskClassification => {
  if (taskType !== undefined && WORKFLOW_ACTORS.has(taskType)) {
    return {
      requestType: ModelRequestSessionType.Other,
      retryBudget: ModelRetryBudget.Unbounded,
    };
  }
  if (taskType !== undefined && SUBAGENT_CHILDREN.has(taskType)) {
    return {
      requestType: ModelRequestSessionType.Subagent,
      retryBudget: ModelRetryBudget.Default,
    };
  }
  return {
    requestType: ModelRequestSessionType.Main,
    retryBudget: ModelRetryBudget.Default,
  };
};
