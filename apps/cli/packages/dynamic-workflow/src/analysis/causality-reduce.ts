/**
 * Reduce ordering graphs using edge-kind strength. Data and control have equal
 * witness strength, followed by fifo and seq. Carry edges represent one iteration
 * boundary and are tested separately from forward edges.
 */

export type OrderKind = "data" | "control" | "fifo" | "seq" | "carry";

/** Ordered-pair deduplication ranks; witness eligibility uses separate rules. */
export const KIND_RANK: Record<OrderKind, number> = {
  carry: 0,
  control: 4,
  data: 3,
  fifo: 2,
  seq: 1,
};

export interface ReducibleEdge {
  from: string;
  to: string;
  kind: OrderKind;
  /** Forward kind used to judge a carry witness; omitted values use data. */
  carryOf?: Exclude<OrderKind, "carry">;
}

// Witness strength is separate from the public dedup rank.
const JUSTIFIED_BY: Partial<Record<OrderKind, ReadonlySet<OrderKind>>> = {
  control: new Set<OrderKind>(["data", "control"]),
  data: new Set<OrderKind>(["data", "control"]),
  fifo: new Set<OrderKind>(["data", "control", "fifo"]),
  seq: new Set<OrderKind>(["data", "control", "fifo", "seq"]),
};

/**
 * Visit forward edges in input order, then carry edges, removing candidates with
 * surviving eligible witnesses. Return original edge references in input order;
 * shared input references share deletion decisions. Inputs are not modified.
 */
export function reduceOrdering<E extends ReducibleEdge>(edges: readonly E[]): E[] {
  type EdgeState = { edge: E; live: boolean };
  type Outgoing = { forward: EdgeState[]; carry: EdgeState[] };
  const identity = new Map<E, EdgeState>();
  const occurrences: EdgeState[] = [];
  const forward: EdgeState[] = [];
  const carry: EdgeState[] = [];
  const adjacency = new Map<string, Outgoing>();

  // Input occurrences retain their order; aliases share only the liveness decision.
  edges.forEach((edge) => {
    let state = identity.get(edge);
    if (state === undefined) {
      state = { edge, live: true };
      identity.set(edge, state);
    }
    occurrences.push(state);
    let outgoing = adjacency.get(edge.from);
    if (outgoing === undefined) {
      outgoing = { forward: [], carry: [] };
      adjacency.set(edge.from, outgoing);
    }
    if (edge.kind === "carry") {
      carry.push(state);
      outgoing.carry.push(state);
    } else {
      forward.push(state);
      outgoing.forward.push(state);
    }
  });

  // Multi-source forward closure, optionally excluding the candidate's direct pair.
  const reachable = (
    seeds: Iterable<string>,
    allowed: ReadonlySet<OrderKind>,
    omit?: { from: string; to: string },
    target?: string,
  ): Set<string> => {
    const visited = new Set(seeds);
    if (target !== undefined && visited.has(target)) return visited;
    const queue = [...visited];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const node = queue[cursor] as string;
      for (const state of adjacency.get(node)?.forward ?? []) {
        const edge = state.edge;
        if (!state.live || !allowed.has(edge.kind)) continue;
        if (omit !== undefined && node === omit.from && edge.to === omit.to) continue;
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        if (target !== undefined && edge.to === target) return visited;
        queue.push(edge.to);
      }
    }
    return visited;
  };

  for (const state of forward) {
    const edge = state.edge;
    const allowed = JUSTIFIED_BY[edge.kind];
    if (allowed === undefined || edge.from === edge.to) continue;
    if (reachable([edge.from], allowed, edge, edge.to).has(edge.to)) state.live = false;
  }

  // A bridge joins two forward closures; no second carry can enter either closure.
  for (const candidate of carry) {
    const edge = candidate.edge;
    const allowed = JUSTIFIED_BY[edge.carryOf ?? "data"];
    if (allowed === undefined) continue;
    const prefix = reachable([edge.from], allowed);
    const heads = new Set<string>();
    for (const node of prefix) {
      for (const bridge of adjacency.get(node)?.carry ?? []) {
        if (!bridge.live || bridge === candidate) continue;
        if (allowed.has(bridge.edge.carryOf ?? "data")) heads.add(bridge.edge.to);
      }
    }
    if (reachable(heads, allowed, undefined, edge.to).has(edge.to)) candidate.live = false;
  }

  const result: E[] = [];
  for (const state of occurrences) if (state.live) result.push(state.edge);
  return result;
}
