// ============================================================
// 阶段边的折叠与归约 - 显示图阶段层的唯一删边点
// ============================================================
// 从 create-workflow-graph-bounds.ts 拆出：折叠本身是一段自洽的纯图论（有序对折叠 +
// 强连通分量 + 在缩点上跑分析器的归约），而裁剪层其余部分讲的是引用完整性与上限。拆开后
// 这段逻辑可以单独读、单独钉住，也给 bounds 文件留出 max-lines 余量。

import {
  reduceOrdering,
  type ReducibleEdge,
  // 与 bounds 同一条理由：走 /projections 子路径而非根桶，根桶会把 typescript 编译器
  // 一起拖进浏览器包（作品集回放在浏览器里复用这条链路）。
} from "@knorvia/dynamic-workflow/projections";

/** 折叠前的一条边：种类已经坍缩成「是不是回边」。 */
export interface RawEdge {
  from: string;
  to: string;
  back: boolean;
}

/**
 * 阶段边的折叠（交接边由分析器按同一算法归约好了送来，这里不再碰）：
 *
 * 一、同一有序对折叠成一条（首见序），`back` 当且仅当折叠前的**全部**边都是回边——存在
 * 任何一条前向事实就按前向处理，宁可让排秩多一条约束，不能少一条；自环丢弃。
 *
 * 二、归约跑在**缩点**上，而不是原图上。取前向边（回边不算）的强连通分量：同一分量内的边
 * 无条件留下，跨分量的边按 (分量对, kind) 去重后喂给分析器的贪心不可约归约（前向边同一
 * kind、回边作 carry（`carryOf: "seq"`），它就退化成无类型归约），再按存活的分量对展开
 * 回原边。输出保持输入序。
 *
 * 把原图直接喂给归约是错的：一条见证路径可以绕环走回
 * 来。两组互不相干的 if/else 复用同一对阶段名时，商图里 甲→乙 与 乙→甲 都是普通分支边，
 * 归约据此把 选择→甲 判成被 选择→乙→甲 蕴含而删掉，画面就变成「条件分支总是走乙，甲是乙
 * 的岔路」——一句假话。穿过与端点同环的节点的路径对「控制能不能到那儿」不作任何断言，所以
 * 见证只在缩点这张 DAG 上才成立。
 */
export function foldPhaseEdges(raw: readonly RawEdge[]): RawEdge[] {
  const folded = foldPairs(raw);
  const componentOf = componentsOf(folded);
  // Map 按 SameValueZero 认同 NaN 分量；交给有限端点 reducer 会把该边误当见证删掉。
  const sameComponent = (from: string, to: string): boolean => from === to || Object.is(from, to);
  const keyOf = (from: string, to: string, back: boolean): string => `${from} ${to} ${back}`;
  const bindings: { edge: RawEdge; from: string; to: string }[] = [];
  const candidates: ReducibleEdge[] = [];
  const candidateKeys = new Set<string>();

  // 跨分量的边按 (分量对, kind) 去重，首见序；同分量的边根本不进归约——它在缩点里是自环，
  // 对 DAG 上的可达关系什么都没说。
  for (const edge of folded) {
    const from = componentOf.get(edge.from) ?? edge.from;
    const to = componentOf.get(edge.to) ?? edge.to;
    bindings.push({ edge, from, to });
    if (sameComponent(from, to)) continue;
    const key = keyOf(from, to, edge.back);
    if (candidateKeys.has(key)) continue;
    candidateKeys.add(key);
    candidates.push(
      edge.back ? { carryOf: "seq", from, kind: "carry", to } : { from, kind: "seq", to },
    );
  }
  const kept = new Set(
    reduceOrdering(candidates).map((edge) => keyOf(edge.from, edge.to, edge.kind === "carry")),
  );
  const result: RawEdge[] = [];
  for (const { edge, from, to } of bindings) {
    if (sameComponent(from, to) || kept.has(keyOf(from, to, edge.back))) result.push(edge);
  }
  return result;
}

/** 同一有序对折叠成一条，首见序；`back` 是折叠成员的合取；自环丢弃。 */
function foldPairs(raw: readonly RawEdge[]): RawEdge[] {
  const order: string[] = [];
  const byKey = new Map<string, RawEdge>();
  for (const edge of raw) {
    if (edge.from === edge.to) continue;
    const key = `${edge.from} ${edge.to}`;
    const seen = byKey.get(key);
    if (seen === undefined) {
      order.push(key);
      byKey.set(key, { ...edge });
    } else {
      seen.back = seen.back && edge.back;
    }
  }
  return order.map((key) => byKey.get(key) as RawEdge);
}

/** Forward/reverse DFS finds components; first endpoint rank selects stable representatives. */
function componentsOf(folded: readonly RawEdge[]): Map<string, string> {
  const ids: string[] = [];
  const indexById = new Map<string, number>();
  const outgoing: number[][] = [];
  const incoming: number[][] = [];
  const index = (id: string): number => {
    const existing = indexById.get(id);
    if (existing !== undefined) return existing;
    const added = ids.length;
    indexById.set(id, added);
    ids.push(id);
    outgoing.push([]);
    incoming.push([]);
    return added;
  };
  for (const edge of folded) {
    const from = index(edge.from);
    const to = index(edge.to);
    if (edge.back) continue;
    outgoing[from]!.push(to);
    incoming[to]!.push(from);
  }

  // 原型数字属性会让稀疏标记跳过节点并误删分支边；冻结反例要求标记和代表只读调用内记录。
  const visited = new Set<number>();
  const finished: number[] = [];
  for (let start = 0; start < ids.length; start++) {
    if (visited.has(start)) continue;
    visited.add(start);
    const frames = [{ node: start, cursor: 0 }];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const targets = outgoing[frame.node]!;
      if (frame.cursor === targets.length) {
        finished.push(frame.node);
        frames.pop();
        continue;
      }
      const target = targets[frame.cursor++]!;
      if (visited.has(target)) continue;
      visited.add(target);
      frames.push({ node: target, cursor: 0 });
    }
  }

  const assigned = new Set<number>();
  const representatives = new Map<number, number>();
  for (let position = finished.length - 1; position >= 0; position--) {
    const start = finished[position]!;
    if (assigned.has(start)) continue;
    const pending = [start];
    const members: number[] = [];
    let representative = start;
    assigned.add(start);
    while (pending.length > 0) {
      const node = pending.pop()!;
      members.push(node);
      if (node < representative) representative = node;
      for (const predecessor of incoming[node]!) {
        if (assigned.has(predecessor)) continue;
        assigned.add(predecessor);
        pending.push(predecessor);
      }
    }
    for (const member of members) representatives.set(member, representative);
  }
  const result = new Map<string, string>();
  for (let node = 0; node < ids.length; node++) {
    result.set(ids[node]!, ids[representatives.get(node)!]!);
  }
  return result;
}
