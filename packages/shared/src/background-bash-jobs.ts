// SPDX-License-Identifier: Apache-2.0

import {
  collectVisibleKnorviaBackgroundTaskControlItems,
  getKnorviaBackgroundTaskControlItemElapsedMs,
  isActiveKnorviaBackgroundTaskControlItem,
  parseKnorviaBackgroundTaskControlItems,
  type KnorviaBackgroundTaskControlItem,
  type KnorviaBackgroundTaskControlStatus,
} from "./background-task-controls.js";

// Bash 后台作业状态别名定义
export type KnorviaBackgroundBashJobStatus = /* 与统一状态同构 */ KnorviaBackgroundTaskControlStatus;

// Bash 专用后台任务控制条目类型（类型窄化为 bash）
export type KnorviaBackgroundBashJob = KnorviaBackgroundTaskControlItem & {
  readonly taskKind: /* 专属于终端执行类别 */ "bash";
};

// 预设默认可见性判定时长阈值（30 秒）
const BASH_JOB_DEFAULT_VISIBILITY_WINDOW_MS = 30_000;

// 解析并筛选仅包含 bash 类型的后台任务条目
export const parseKnorviaBackgroundBashJobs = (
  /* 待解析的任意原始输入序列 */
  incomingPayload: unknown,
): KnorviaBackgroundBashJob[] => {
  const normalizedList = parseKnorviaBackgroundTaskControlItems(incomingPayload);
  const terminalJobs: KnorviaBackgroundBashJob[] = [];

  for (let idx = 0; idx < normalizedList.length; idx += 1) {
    const candidateItem = normalizedList[idx];
    if (candidateItem && candidateItem.taskKind === "bash") {
      terminalJobs.push(candidateItem as KnorviaBackgroundBashJob);
    }
  }

  return terminalJobs;
};

// 检查 bash 任务是否处于活跃运行状态
export const isActiveKnorviaBackgroundBashJob = (
  /* 待判定的 bash 作业对象 */
  targetBashJob: KnorviaBackgroundBashJob,
): boolean => {
  return isActiveKnorviaBackgroundTaskControlItem(targetBashJob);
};

// 计算指定 bash 作业的已耗时毫秒数
export const getKnorviaBackgroundBashJobElapsedMs = (
  /* 目标 bash 作业记录 */
  targetBashJob: KnorviaBackgroundBashJob,
  /* 当前时间戳参考锚点 */
  clockReference: number = Date.now(),
): number => {
  return getKnorviaBackgroundTaskControlItemElapsedMs(targetBashJob, clockReference);
};

// 收集所有满足时长阈值且处于活跃状态的 bash 任务
export const collectVisibleKnorviaBackgroundBashJobs = (
  /* 作业列表集合 */
  sourceBashJobs: readonly KnorviaBackgroundBashJob[],
  /* 当前时间戳参考基准 */
  clockReference: number = Date.now(),
  /* 可视化时长门限阈值 */
  thresholdMs: number = BASH_JOB_DEFAULT_VISIBILITY_WINDOW_MS,
): Array<KnorviaBackgroundBashJob & { elapsedMs: number }> => {
  const visibleEntries = collectVisibleKnorviaBackgroundTaskControlItems(sourceBashJobs, clockReference, thresholdMs);
  return visibleEntries as Array<KnorviaBackgroundBashJob & { elapsedMs: number }>;
};
