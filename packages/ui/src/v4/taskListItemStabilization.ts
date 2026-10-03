// SPDX-License-Identifier: Apache-2.0
// Source-exposed reference projection; current consumers and pending source review retained.
import type { KnorviaTaskMeta } from "@knorvia/shared";
import { buildTaskEntityKey } from "@/lib/taskQueryCache.js";
import { areStabilizedValuesEquivalent } from "@/v4/taskListValueComparison.js";

export { areStabilizedValuesEquivalent } from "@/v4/taskListValueComparison.js";

export function buildTaskListItemIdentityKey(meta: KnorviaTaskMeta): string {
  return buildTaskEntityKey(meta);
}

export function areTaskListItemsEquivalent(left: KnorviaTaskMeta, right: KnorviaTaskMeta): boolean {
  return areStabilizedValuesEquivalent(left, right);
}

export function stabilizeTaskListItems<T extends KnorviaTaskMeta>(previous: T[], next: T[]): T[] {
  if (previous.length === 0) return next;
  const available = new Map<string, T>();
  for (const meta of previous) available.set(buildTaskListItemIdentityKey(meta), meta);
  const result: T[] = new Array<T>(next.length);
  let sameOrder = previous.length === next.length;
  for (let index = 0; index < next.length; index += 1) {
    if (!(index in next)) continue;
    const incoming = next[index]!;
    const existing = available.get(buildTaskListItemIdentityKey(incoming));
    const reusable = existing !== undefined && areTaskListItemsEquivalent(existing, incoming);
    result[index] = reusable ? existing : incoming;
    if (!reusable || result[index] !== previous[index]) sameOrder = false;
  }
  return sameOrder ? previous : result;
}
