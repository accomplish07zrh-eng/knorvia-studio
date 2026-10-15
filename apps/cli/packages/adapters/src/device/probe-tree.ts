// SPDX-License-Identifier: Apache-2.0
// 进程树：建父子索引、按根展开、按行取样本。
import {
  toSample,
  type ProcessProbeSample,
  type ProcessRelation,
  type ProcessRow,
} from "./probe-types.js";

type EdgeIndex = Map<number | undefined, number[]>;

/** 逐行建边：同一 PID 的重复行各算一次，不覆盖先前的父子关系。 */
function buildEdges(edges: readonly ProcessRelation[]): EdgeIndex {
  const index: EdgeIndex = new Map();
  for (let cursor = 0; cursor < edges.length; cursor += 1) {
    const edge = edges[cursor]!;
    const kids = index.get(edge.parentPid);
    if (kids === undefined) index.set(edge.parentPid, [edge.pid]);
    else kids.push(edge.pid);
  }
  return index;
}

/** 单棵树深度优先展开：先入队根，再按输入顺序递归子节点，重复出现只算一次。 */
function treeMembers(index: EdgeIndex, root: number): number[] {
  const pids: number[] = [];
  const queued = new Set<number>([root]);
  const walk = (pid: number): void => {
    pids.push(pid);
    for (const child of index.get(pid) ?? []) {
      if (queued.has(child)) continue;
      queued.add(child);
      walk(child);
    }
  };
  walk(root);
  return pids;
}

export function collectProcessTreePids(
  relations: readonly ProcessRelation[],
  rootPids: readonly number[],
): ReadonlyMap<number, readonly number[]> {
  const present = new Set<number>();
  for (const edge of relations) present.add(edge.pid);
  const index = buildEdges(relations);
  const byRoot = new Map<number, readonly number[]>();
  for (const root of rootPids) {
    if (!present.has(root)) continue;
    byRoot.set(root, treeMembers(index, root));
  }
  return byRoot;
}

/** 每棵树按成员取样本；同一 PID 以最后一行作为样本值。 */
export function groupProcessTrees(
  rows: readonly ProcessRow[],
  rootPids: readonly number[],
): ReadonlyMap<number, readonly ProcessProbeSample[]> {
  const lastRow = new Map<number, ProcessRow>();
  for (let cursor = 0; cursor < rows.length; cursor += 1) {
    const row = rows[cursor]!;
    lastRow.set(row.pid, row);
  }
  const byRoot = new Map<number, readonly ProcessProbeSample[]>();
  for (const [root, pids] of collectProcessTreePids(rows, rootPids)) {
    byRoot.set(
      root,
      pids.map((pid) => toSample(lastRow.get(pid)!)),
    );
  }
  return byRoot;
}
