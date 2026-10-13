// SPDX-License-Identifier: Apache-2.0
// 边路由索引：记录 from → to 的邻接关系，并提供可达性判定（用于成环检测）。
import type { WorkflowGraphRecordEdge } from "./types.js";

/** 邻接索引：按起点聚合目标集合。 */
export class RouteIndex {
  readonly #targets = new Map<string, Set<string>>();

  /** 加入一条边；重复加入无副作用。 */
  add(edge: WorkflowGraphRecordEdge): void {
    const bucket = this.#targets.get(edge.from);
    if (bucket === undefined) {
      this.#targets.set(edge.from, new Set([edge.to]));
      return;
    }
    bucket.add(edge.to);
  }

  /** 可达性判定：从 origin 出发能否抵达 destination（DFS，visited 去重）。 */
  reaches(origin: string, destination: string): boolean {
    const pending = [origin];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const cursor = pending.pop() as string;
      if (cursor === destination) return true;
      if (visited.has(cursor)) continue;
      visited.add(cursor);
      for (const next of this.#targets.get(cursor) ?? []) {
        if (!visited.has(next)) pending.push(next);
      }
    }
    return false;
  }
}
