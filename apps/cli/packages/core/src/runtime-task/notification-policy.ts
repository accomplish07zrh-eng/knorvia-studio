// SPDX-License-Identifier: Apache-2.0
// 子代理里「密封之后」的 Bash 通知抑制判定：密封表示父代理已经不再需要这条后台完成通知。
import type { RuntimeTaskSnapshot, RuntimeTaskType } from "./registry.js";

const BASH_TOOL_NAME = "Bash";
const LOCAL_BASH_TASK_TYPE = "local_bash";

type TaskTypeCarrier = Pick<RuntimeTaskSnapshot, "taskType" | "type">;

// 任务类型优先取 taskType，其次取 type（快照里两个字段的历史命名）。
function runtimeTaskTypeOf(task: TaskTypeCarrier | undefined): RuntimeTaskType | undefined {
  if (!task) return undefined;
  return task.taskType ?? task.type;
}

interface SuppressionInput {
  isSubagentChildRuntime: boolean;
  notificationSealed: boolean;
  registryTask?: TaskTypeCarrier;
  toolName?: string;
}

// 三条同时成立才抑制：子代理子运行、通知已密封、且这是 Bash 调用或 local_bash 任务。
export function shouldSuppressSealedSubagentBashNotification(input: SuppressionInput): boolean {
  const childRuntime = input.isSubagentChildRuntime;
  if (!childRuntime) return false;
  const sealed = input.notificationSealed;
  if (!sealed) return false;
  if (input.toolName === BASH_TOOL_NAME) return true;
  return runtimeTaskTypeOf(input.registryTask) === LOCAL_BASH_TASK_TYPE;
}
