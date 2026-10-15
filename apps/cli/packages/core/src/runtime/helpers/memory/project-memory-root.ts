// SPDX-License-Identifier: Apache-2.0
// 项目记忆根的启用判定（B45）。只有「配置启用、未显式 use=false 关闭、给了 CLI 存储根、
// 任务类型属主记忆任务」四项同时成立才解析记忆根，否则 undefined。同步纯计算、不抛异常，
// 路径的实际解析交给记忆模块（本模块不加工路径）。
import type { AgentRuntimeConfig } from "../../types.js";
import { resolveProjectMemoryRoot } from "../../../memory/project-root.js";

// 属于主记忆任务的任务类型集合（缺省 taskType 也算主任务）。
const MAIN_MEMORY_TASK_TYPES = new Set<AgentRuntimeConfig["taskType"]>([
  undefined,
  "interactive",
  "fork",
  "selection_side_chat",
  "workflow_parent",
]);

// 解析启用中的项目记忆根；任一前提不满足给 undefined。
export const resolveEnabledProjectMemoryRoot = (
  config: AgentRuntimeConfig,
  workspacePath: string,
): string | undefined => {
  const settings = config.memory;
  const storageRoot = settings?.cliStorageRoot;
  const optedIn = Boolean(settings?.enabled) && settings?.use !== false;
  const mainTask = MAIN_MEMORY_TASK_TYPES.has(config.taskType);
  if (!optedIn || !storageRoot || !mainTask) return undefined;
  return resolveProjectMemoryRoot({
    cliStorageRoot: storageRoot,
    workspaceIdentity: settings?.workspaceIdentity,
    workspacePath,
  });
};
