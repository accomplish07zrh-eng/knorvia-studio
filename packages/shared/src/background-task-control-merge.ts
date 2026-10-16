// SPDX-License-Identifier: Apache-2.0

import type { KnorviaBackgroundTaskControlItem } from "./background-task-controls.js";

function absorb(
  registry: Map<string, KnorviaBackgroundTaskControlItem>,
  batch: readonly KnorviaBackgroundTaskControlItem[],
): void {
  for (const item of batch) registry.set(item.jobId, item);
}

/** current 先占位，updates 覆盖同 id 并追加新 id。位置取第一次出现。 */
export function mergeKnorviaBackgroundTaskControlItems(
  existing: readonly KnorviaBackgroundTaskControlItem[],
  incoming: readonly KnorviaBackgroundTaskControlItem[],
): KnorviaBackgroundTaskControlItem[] {
  const registry = new Map<string, KnorviaBackgroundTaskControlItem>();
  absorb(registry, existing);
  absorb(registry, incoming);
  return [...registry.values()];
}
