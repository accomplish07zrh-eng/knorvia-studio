// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolInputValidationIssue as Issue } from "../tool-input-validation-issues.js";
import { descendant } from "./identity.js";

class Ready {
  constructor(private readonly positions: number[]) {}

  add(position: number): void {
    const heap = this.positions;
    let slot = heap.length;
    heap.push(position);
    while (slot > 0) {
      const parent = Math.floor((slot - 1) / 2);
      if (heap[parent] <= position) break;
      heap[slot] = heap[parent];
      slot = parent;
    }
    heap[slot] = position;
  }

  take(): number {
    const heap = this.positions;
    const first = heap[0];
    const last = heap.pop()!;
    if (!heap.length) return first;
    let slot = 0;
    while (slot * 2 + 1 < heap.length) {
      let child = slot * 2 + 1;
      if (child + 1 < heap.length && heap[child + 1] < heap[child]) child++;
      if (last <= heap[child]) break;
      heap[slot] = heap[child];
      slot = child;
    }
    heap[slot] = last;
    return first;
  }
}

export function descendantsBeforeBounds(issues: readonly Issue[]): Issue[] {
  // 限额只依赖原序列中后续的后代。就绪堆按原索引出队，避免无依赖项反复全表扫描。
  const bounds = issues.flatMap((issue, index) => {
    if ((issue.code !== "too_big" && issue.code !== "too_small") || issue.origin !== "array")
      return [];
    let remaining = 0;
    for (let next = index + 1; next < issues.length; next++)
      if (descendant(issues[next].path, issue.path)) remaining++;
    return [{ index, path: issue.path, remaining }];
  });
  const blocked = new Set(
    bounds.filter((bound) => bound.remaining > 0).map((bound) => bound.index),
  );
  if (!blocked.size) return [...issues];
  const ready = new Ready(issues.flatMap((_issue, index) => (blocked.has(index) ? [] : [index])));
  const ordered: Issue[] = [];
  while (ordered.length < issues.length) {
    const next = ready.take();
    ordered.push(issues[next]);
    for (const bound of bounds) {
      if (bound.index >= next) break;
      if (bound.remaining > 0 && descendant(issues[next].path, bound.path)) {
        bound.remaining--;
        if (!bound.remaining) ready.add(bound.index);
      }
    }
  }
  return ordered;
}
