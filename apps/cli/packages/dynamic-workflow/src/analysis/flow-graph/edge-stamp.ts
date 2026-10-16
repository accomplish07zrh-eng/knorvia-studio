// SPDX-License-Identifier: Apache-2.0

import type { JumpKind } from "../causality-order.js";
import type { FlowEdge, FlowEdgeKind, FlowNode, FlowVia, Src } from "../flow-graph.js";

// An edge source is the node an edge leaves, plus the kind a later region may
// promote. Heavier kinds replace lighter ones. The projected edge list is then
// ordered by endpoint position, with entry, sink, and abort pinned outside it.

function weight(kind: FlowEdgeKind): number {
  if (kind === "next") return 0;
  if (kind === "branch" || kind === "fork") return 1;
  if (kind === "loop") return 3;
  return kind === "throw" || kind === "may-throw" ? 4 : 2;
}

export function stamp(from: string, kind: FlowEdgeKind, via?: FlowVia): Src {
  return via === undefined ? { from, kind } : { from, kind, via };
}

export function promoteKind(rows: readonly Src[], edgeKind: FlowEdgeKind, route?: FlowVia): Src[] {
  const heavier = weight(edgeKind);
  return rows.map((row) => (heavier > weight(row.kind) ? stamp(row.from, edgeKind, route) : row));
}

export function forceKind(rows: readonly Src[], edgeKind: FlowEdgeKind, route?: FlowVia): Src[] {
  return rows.map((row) => stamp(row.from, edgeKind, route));
}

export function uniqueSrcs(rows: readonly Src[]): Src[] {
  const prior = new Set<string>();
  return rows.filter((row) => {
    const signature = row.from + "|" + row.kind + "|" + (row.via ?? "");
    const fresh = prior.has(signature) === false;
    if (fresh) prior.add(signature);
    return fresh;
  });
}

export function jumpShape(kind: JumpKind): { kind: FlowEdgeKind; via?: FlowVia } {
  if (kind === "throw") return { kind: "throw" };
  const edgeKind = kind === "break" ? "exit" : kind === "return" ? "jump" : "loop";
  return { kind: edgeKind, via: kind };
}

export function pushSrcs(into: Src[], srcs: readonly Src[]): void {
  for (const src of srcs) into.push(src);
}

function byEndpoint(at: (id: string) => number, left: FlowEdge, right: FlowEdge): number {
  const fromDelta = at(left.from) - at(right.from);
  const toDelta = at(left.to) - at(right.to);
  if (fromDelta !== 0) return fromDelta;
  if (toDelta !== 0) return toDelta;
  return left.kind.localeCompare(right.kind) || (left.via ?? "").localeCompare(right.via ?? "");
}

export function orderEdges(
  nodes: readonly FlowNode[],
  edges: FlowEdge[],
  sentinels: { readonly entry: string; readonly sink: string; readonly abort: string },
): void {
  const slot = new Map<string, number>();
  nodes.forEach((node, index) => slot.set(node.id, index));
  slot.set(sentinels.entry, -1);
  slot.set(sentinels.sink, nodes.length);
  slot.set(sentinels.abort, nodes.length + 1);
  const past = nodes.length + 2;
  const locate = (id: string): number => slot.get(id) ?? past;
  edges.sort((left, right) => byEndpoint(locate, left, right));
}
