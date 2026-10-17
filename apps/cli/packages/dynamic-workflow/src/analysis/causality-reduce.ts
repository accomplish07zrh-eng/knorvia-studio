/**
 * Reduce ordering graphs using edge-kind strength. Data and control have equal
 * witness strength, followed by fifo and seq. Carry edges represent one iteration
 * boundary and are tested separately from forward edges.
 */

export type OrderKind = "data" | "control" | "fifo" | "seq" | "carry";

const RANK_LADDER: readonly OrderKind[] = ["carry", "seq", "fifo", "data", "control"];

/** Ordered-pair deduplication ranks; witness eligibility uses separate rules. */
export const KIND_RANK: Record<OrderKind, number> = ladderRanks(RANK_LADDER);

export interface ReducibleEdge {
  from: string;
  to: string;
  kind: OrderKind;
  /** Forward kind used to judge a carry witness; omitted values use data. */
  carryOf?: Exclude<OrderKind, "carry">;
}

const DEFAULT_CARRY_KIND: Exclude<OrderKind, "carry"> = "data";

type Witnesses = ReadonlySet<OrderKind>;

interface Trail<E> {
  bridges: Map<string, E[]>;
  dropped: Set<E>;
  hops: Map<string, E[]>;
}

// Witness strength is separate from the public dedup rank.
const WITNESS_TIERS: readonly (readonly OrderKind[])[] = [["data", "control"], ["fifo"], ["seq"]];

const ELIGIBLE_WITNESSES: Map<OrderKind, Witnesses> = cumulativeTiers(WITNESS_TIERS);

function ladderRanks(kinds: readonly OrderKind[]): Record<OrderKind, number> {
  const collected: Partial<Record<OrderKind, number>> = {};
  kinds.forEach((kind, position) => {
    collected[kind] = position;
  });
  return collected as Record<OrderKind, number>;
}

function cumulativeTiers(tiers: readonly (readonly OrderKind[])[]): Map<OrderKind, Witnesses> {
  const table = new Map<OrderKind, Witnesses>();
  const stronger: OrderKind[] = [];
  for (const tier of tiers) {
    for (const kind of tier) stronger.push(kind);
    const pooled: Witnesses = new Set<OrderKind>(stronger);
    for (const kind of tier) table.set(kind, pooled);
  }
  return table;
}

function eligibilityFor(kind: OrderKind): Witnesses | undefined {
  return ELIGIBLE_WITNESSES.get(kind);
}

function carryBasis(edge: ReducibleEdge): OrderKind {
  return edge.carryOf ?? DEFAULT_CARRY_KIND;
}

function bucketBySource<E extends ReducibleEdge>(
  edges: readonly E[],
  carried: boolean,
): Map<string, E[]> {
  const buckets = new Map<string, E[]>();
  for (const edge of edges) {
    if (carried !== (edge.kind === "carry")) continue;
    const listed = buckets.get(edge.from) ?? [];
    listed.push(edge);
    buckets.set(edge.from, listed);
  }
  return buckets;
}

function trailOf<E extends ReducibleEdge>(edges: readonly E[]): Trail<E> {
  const trail: Trail<E> = {
    bridges: bucketBySource(edges, true),
    dropped: new Set<E>(),
    hops: bucketBySource(edges, false),
  };
  return trail;
}

function onwardFrom<E extends ReducibleEdge>(trail: Trail<E>, node: string): readonly E[] {
  return trail.hops.get(node) ?? [];
}

function bridgingFrom<E extends ReducibleEdge>(trail: Trail<E>, node: string): readonly E[] {
  return trail.bridges.get(node) ?? [];
}

function discard<E extends ReducibleEdge>(trail: Trail<E>, edge: E): void {
  trail.dropped.add(edge);
}

function survivors<E extends ReducibleEdge>(edges: readonly E[], trail: Trail<E>): E[] {
  return edges.filter((edge) => !trail.dropped.has(edge));
}

function forwardImplied<E extends ReducibleEdge>(trail: Trail<E>, candidate: E): boolean {
  const witnesses = eligibilityFor(candidate.kind);
  if (witnesses === undefined || candidate.from === candidate.to) return false;
  const implied = closureFrom(trail, [candidate.from], witnesses, candidate);
  return implied.has(candidate.to);
}

function carryImplied<E extends ReducibleEdge>(trail: Trail<E>, candidate: E): boolean {
  const witnesses = eligibilityFor(carryBasis(candidate));
  if (witnesses === undefined) return false;
  const landing = bridgeHeads(trail, candidate, witnesses);
  return closureFrom(trail, landing, witnesses).has(candidate.to);
}

function dropImpliedForward<E extends ReducibleEdge>(edges: readonly E[], trail: Trail<E>): void {
  for (const edge of edges) {
    if (edge.kind === "carry") continue;
    if (forwardImplied(trail, edge)) discard(trail, edge);
  }
}

function dropImpliedCarries<E extends ReducibleEdge>(edges: readonly E[], trail: Trail<E>): void {
  for (const edge of edges) {
    if (edge.kind !== "carry") continue;
    if (carryImplied(trail, edge)) discard(trail, edge);
  }
}

/**
 * Visit forward edges in input order, then carry edges, removing candidates with
 * surviving eligible witnesses. Return original edge references in input order;
 * shared input references share deletion decisions. Inputs are not modified.
 */
export function reduceOrdering<E extends ReducibleEdge>(edges: readonly E[]): E[] {
  // Input occurrences retain their order; aliases share only the liveness decision.
  const trail = trailOf(edges);
  dropImpliedForward(edges, trail);
  dropImpliedCarries(edges, trail);
  return survivors(edges, trail);
}

// Multi-source forward closure, optionally excluding the candidate's direct pair.
function closureFrom<E extends ReducibleEdge>(
  trail: Trail<E>,
  origins: Iterable<string>,
  witnesses: Witnesses,
  direct?: E,
): Set<string> {
  const reached = new Set<string>(origins);
  const pending: string[] = [...reached];
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const node = pending[cursor] as string;
    for (const hop of onwardFrom(trail, node)) {
      if (trail.dropped.has(hop) || !witnesses.has(hop.kind)) continue;
      const repeatedPair = direct !== undefined && hop.from === direct.from && hop.to === direct.to;
      if (repeatedPair || reached.has(hop.to)) continue;
      reached.add(hop.to);
      pending.push(hop.to);
    }
  }
  return reached;
}

// A bridge joins two forward closures; no second carry can enter either closure.
function bridgeHeads<E extends ReducibleEdge>(
  trail: Trail<E>,
  candidate: E,
  witnesses: Witnesses,
): Set<string> {
  const prefix = closureFrom(trail, [candidate.from], witnesses);
  const landing = new Set<string>();
  for (const landed of prefix) {
    for (const bridge of bridgingFrom(trail, landed)) {
      if (bridge === candidate || trail.dropped.has(bridge)) continue;
      if (witnesses.has(carryBasis(bridge))) landing.add(bridge.to);
    }
  }
  return landing;
}
