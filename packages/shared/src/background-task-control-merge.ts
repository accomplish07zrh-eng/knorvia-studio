// SPDX-License-Identifier: Apache-2.0

import type { KnorviaBackgroundTaskControlItem } from "./background-task-controls.js";

// 合并控制项配置常量
const MERGE_INITIAL_CAPACITY = 0;

// 合并控制项：以现有列表为基础，增量更新同 ID 项并追加新条目，保留首次出现位次
export function mergeKnorviaBackgroundTaskControlItems(
  /* 现有控制条目列表 */
  current: readonly KnorviaBackgroundTaskControlItem[],
  /* 待合并入库的新更新项列表 */
  updates: readonly KnorviaBackgroundTaskControlItem[],
): KnorviaBackgroundTaskControlItem[] {
  // 构建基于 jobId 的有序字典映射容器
  const registry = new Map<string, KnorviaBackgroundTaskControlItem>();

  // 1. 先行装载存量作业，奠定初始顺序基线
  for (let cIdx = MERGE_INITIAL_CAPACITY; cIdx < current.length; cIdx += 1) {
    const existingJob = current[cIdx];
    if (existingJob) {
      registry.set(existingJob.jobId, existingJob);
    }
  }

  // 2. 依次叠加新传入的更新补丁（覆盖旧值，新增项追加在尾部）
  for (let uIdx = MERGE_INITIAL_CAPACITY; uIdx < updates.length; uIdx += 1) {
    const incomingJob = updates[uIdx];
    if (incomingJob) {
      registry.set(incomingJob.jobId, incomingJob);
    }
  }

  // 导出合并后的扁平作业条目列表
  return Array.from(registry.values());
}
