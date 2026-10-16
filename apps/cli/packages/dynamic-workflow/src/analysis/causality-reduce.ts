// SPDX-License-Identifier: Apache-2.0

/**
 * Remove ordering edges that a surviving path already explains.
 * Data and control witness each other; fifo also accepts fifo; seq accepts
 * every forward kind. Carry edges are a later pass: forward closure, exactly
 * one other eligible carry, then forward closure again. A missing `carryOf`
 * is data. Self-loops are kept. The input array and edge objects stay put.
 */

export type OrderKind = "data" | "control" | "fifo" | "seq" | "carry";

export interface ReducibleEdge {
  from: string;
  to: string;
  kind: OrderKind;
  /** Forward kind a carry was built from. Absent values are judged as data. */
  carryOf?: Exclude<OrderKind, "carry">;
}

/** Dedup rank only. Witness checks use a separate lattice, not these numbers. */
export const KIND_RANK: Record<OrderKind, number> = {
  carry: 0,
  control: 4,
  data: 3,
  fifo: 2,
  seq: 1,
};

interface Slot<E extends ReducibleEdge> {
  edge: E;
  live: boolean;
}

interface Portals<E extends ReducibleEdge> {
  forward: Slot<E>[];
  carry: Slot<E>[];
}

interface Indexed<E extends ReducibleEdge> {
  occurrences: Slot<E>[];
  forward: Slot<E>[];
  carry: Slot<E>[];
  portals: Map<string, Portals<E>>;
}

const HARD: ReadonlySet<OrderKind> = new Set<OrderKind>(["data", "control"]);
const FIFO: ReadonlySet<OrderKind> = new Set<OrderKind>(["data", "control", "fifo"]);
const SEQUENTIAL: ReadonlySet<OrderKind> = new Set<OrderKind>(["data", "control", "fifo", "seq"]);

function witnessesOf(kind: OrderKind): ReadonlySet<OrderKind> | undefined {
  switch (kind) {
    case "data":
    case "control":
      return HARD;
    case "fifo":
      return FIFO;
    case "seq":
      return SEQUENTIAL;
    default:
      return undefined;
  }
}

function portalsFor<E extends ReducibleEdge>(
  portals: Map<string, Portals<E>>,
  source: string,
): Portals<E> {
  const existing = portals.get(source);
  if (existing !== undefined) return existing;
  const created: Portals<E> = { forward: [], carry: [] };
  portals.set(source, created);
  return created;
}

function indexEdges<E extends ReducibleEdge>(edges: readonly E[]): Indexed<E> {
  const byObject = new Map<E, Slot<E>>();
  const indexed: Indexed<E> = {
    occurrences: [],
    forward: [],
    carry: [],
    portals: new Map<string, Portals<E>>(),
  };
  let cursor = 0;
  while (cursor < edges.length) {
    const edge = edges[cursor];
    cursor += 1;
    if (edge === undefined) continue;
    let slot = byObject.get(edge);
    if (slot === undefined) {
      slot = { edge, live: true };
      byObject.set(edge, slot);
    }
    indexed.occurrences.push(slot);
    const portals = portalsFor(indexed.portals, edge.from);
    if (edge.kind === "carry") {
      indexed.carry.push(slot);
      portals.carry.push(slot);
    } else {
      indexed.forward.push(slot);
      portals.forward.push(slot);
    }
  }
  return indexed;
}

// Queue search over live forward edges. `block` drops every direct hop of that pair.
function reachable<E extends ReducibleEdge>(
  portals: Map<string, Portals<E>>,
  seeds: Iterable<string>,
  allowed: ReadonlySet<OrderKind>,
  block?: { from: string; to: string },
  goal?: string,
): Set<string> {
  const seen = new Set<string>(seeds);
  if (goal !== undefined && seen.has(goal)) return seen;
  const queue = [...seen];
  let head = 0;
  while (head < queue.length) {
    const node = queue[head];
    head += 1;
    if (node === undefined) continue;
    const outgoing = portals.get(node)?.forward;
    if (outgoing === undefined) continue;
    let hop = 0;
    while (hop < outgoing.length) {
      const slot = outgoing[hop];
      hop += 1;
      if (slot === undefined || !slot.live || !allowed.has(slot.edge.kind)) continue;
      const dest = slot.edge.to;
      if (block !== undefined && node === block.from && dest === block.to) continue;
      if (seen.has(dest)) continue;
      seen.add(dest);
      if (goal !== undefined && dest === goal) return seen;
      queue.push(dest);
    }
  }
  return seen;
}

function reduceForward<E extends ReducibleEdge>(indexed: Indexed<E>): void {
  let cursor = 0;
  while (cursor < indexed.forward.length) {
    const slot = indexed.forward[cursor];
    cursor += 1;
    if (slot === undefined) continue;
    const edge = slot.edge;
    const allowed = witnessesOf(edge.kind);
    if (allowed === undefined || edge.from === edge.to) continue;
    const hit = reachable(
      indexed.portals,
      [edge.from],
      allowed,
      { from: edge.from, to: edge.to },
      edge.to,
    );
    if (hit.has(edge.to)) slot.live = false;
  }
}

function carryBasis(edge: ReducibleEdge): OrderKind {
  return edge.carryOf ?? "data";
}

function bridgeHeads<E extends ReducibleEdge>(
  indexed: Indexed<E>,
  prefix: ReadonlySet<string>,
  candidate: Slot<E>,
  allowed: ReadonlySet<OrderKind>,
): Set<string> {
  const heads = new Set<string>();
  for (const node of prefix) {
    const bridges = indexed.portals.get(node)?.carry;
    if (bridges === undefined) continue;
    let cursor = 0;
    while (cursor < bridges.length) {
      const bridge = bridges[cursor];
      cursor += 1;
      if (bridge === undefined || !bridge.live || bridge === candidate) continue;
      if (!allowed.has(carryBasis(bridge.edge))) continue;
      heads.add(bridge.edge.to);
    }
  }
  return heads;
}

function reduceCarry<E extends ReducibleEdge>(indexed: Indexed<E>): void {
  let cursor = 0;
  while (cursor < indexed.carry.length) {
    const candidate = indexed.carry[cursor];
    cursor += 1;
    if (candidate === undefined) continue;
    const allowed = witnessesOf(carryBasis(candidate.edge));
    if (allowed === undefined) continue;
    const prefix = reachable(indexed.portals, [candidate.edge.from], allowed);
    const heads = bridgeHeads(indexed, prefix, candidate, allowed);
    const suffix = reachable(indexed.portals, heads, allowed, undefined, candidate.edge.to);
    if (suffix.has(candidate.edge.to)) candidate.live = false;
  }
}

function survivors<E extends ReducibleEdge>(occurrences: readonly Slot<E>[]): E[] {
  const kept: E[] = [];
  let cursor = 0;
  while (cursor < occurrences.length) {
    const slot = occurrences[cursor];
    cursor += 1;
    if (slot !== undefined && slot.live) kept.push(slot.edge);
  }
  return kept;
}

/**
 * Forward edges first, in input order, then carries. Aliased input objects share
 * one liveness bit, so a repeated reference is deleted everywhere or nowhere.
 */
export function reduceOrdering<E extends ReducibleEdge>(edges: readonly E[]): E[] {
  if (edges.length === 0) return [];
  const indexed = indexEdges(edges);
  reduceForward(indexed);
  reduceCarry(indexed);
  return survivors(indexed.occurrences);
}
