// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolCallId } from "@knorvia/contracts";
import type { ToolScheduleItem } from "../scheduler.js";

function layerBuckets(ordered: ToolScheduleItem[]): Map<number, ToolScheduleItem[]> {
  const depth = new Map<ToolCallId, number>();
  const buckets = new Map<number, ToolScheduleItem[]>();
  for (const item of ordered) {
    const parentDepth = item.dependencies.length
      ? Math.max(...item.dependencies.map((id) => depth.get(id) ?? 0))
      : -1;
    const level = parentDepth + 1;
    depth.set(item.toolCallId, level);
    const peers = buckets.get(level) ?? [];
    peers.push(item);
    buckets.set(level, peers);
  }
  return buckets;
}

export function parallelLayers(ordered: ToolScheduleItem[], width: number): ToolCallId[][] {
  const buckets = layerBuckets(ordered);
  const output: ToolCallId[][] = [];
  let pending: ToolCallId[] = [];
  const publish = () => {
    if (!pending.length) return;
    output.push(pending);
    pending = [];
  };
  for (const level of [...buckets.keys()].sort((left, right) => left - right)) {
    for (const item of buckets.get(level)!) {
      if (!item.canRunParallel) {
        publish();
        output.push([item.toolCallId]);
      } else {
        if (pending.length >= width) publish();
        pending.push(item.toolCallId);
      }
    }
    publish();
  }
  return output;
}
