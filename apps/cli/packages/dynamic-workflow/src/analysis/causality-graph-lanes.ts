import { KIND_RANK } from "./causality-reduce.js";
import {
  UNKNOWN_LANE,
  WORKSPACE_LANE,
  type CausalityGraph,
  type Certainty,
  type Fact,
  type OrderEdge,
  type Step,
} from "./causality-graph-types.js";

// Pure finished-graph expansion and fact joins, without compiler or I/O dependencies.

// Larger candidate sets remain unexpanded.
const MAY_SET_LANE_CAP = 4;

// Separator in projected lane-copy ids.
const COPY_SEPARATOR = "~";

/**
 * Expand candidate lane sets after reduction and before phase projection.
 * Return the input unchanged when no step expands. Copies retain their source site
 * and have maybe certainty; FIFO wiring connects equal lanes only.
 */
export function expandMaySetLanes(graph: CausalityGraph): CausalityGraph {
  type Endpoint = { certainty?: Certainty; id: string; lane?: string };
  type Expansion = { copies?: Step[]; original?: Step };
  const plan = new Map<string, Expansion>();

  // Only admitted replacements populate the plan before the identity decision.
  for (const step of graph.steps) {
    const candidates = step.lanes ?? [];
    if (candidates.length < 2 || candidates.length > MAY_SET_LANE_CAP) continue;
    if (candidates.some((candidate) => candidate === WORKSPACE_LANE || candidate === UNKNOWN_LANE))
      continue;
    plan.set(step.id, {
      copies: candidates.map((lane) => ({
        ...step,
        certainty: "maybe",
        id: `${step.id}${COPY_SEPARATOR}${lane}`,
        lane,
        source: step.id,
      })),
    });
  }
  if (plan.size === 0) return graph;

  // Original lookup and replacements share one entry; a later original cannot erase copies.
  for (const [id, original] of graph.steps.map((step) => [step.id, step] as const)) {
    const entry = plan.get(id);
    if (entry === undefined) plan.set(id, { original });
    else entry.original = original;
  }
  const resolve = (id: string): readonly Endpoint[] => {
    const entry = plan.get(id);
    if (entry?.copies !== undefined) return entry.copies;
    return [{ certainty: entry?.original?.certainty, id, lane: entry?.original?.lane }];
  };

  const wiring: OrderEdge[] = [];
  for (const edge of graph.edges) {
    if (plan.get(edge.from)?.copies === undefined && plan.get(edge.to)?.copies === undefined) {
      wiring.push(edge);
      continue;
    }
    for (const tail of resolve(edge.from)) {
      for (const head of resolve(edge.to)) {
        if (edge.kind === "fifo" && tail.lane !== head.lane) continue;
        wiring.push({
          ...edge,
          certainty: weakest([
            edge.certainty,
            tail.certainty ?? edge.certainty,
            head.certainty ?? edge.certainty,
          ]),
          from: tail.id,
          to: head.id,
        });
      }
    }
  }

  const placed = graph.steps.flatMap((step) => plan.get(step.id)?.copies ?? [step]);
  const returned = graph.sink;
  return {
    edges: wiring,
    lanes: graph.lanes,
    regions: graph.regions,
    steps: placed,
    ...(returned === undefined
      ? {}
      : { sink: { fedBy: returned.fedBy.flatMap((id) => resolve(id).map((node) => node.id)) } }),
  };
}

/**
 * Join ordered-pair facts in first-key order without mutating input records or phase sets.
 * Higher rank and true exactness win; maybe, absent provenance and non-jump witnesses dominate.
 */
export function dedupeFacts(facts: readonly Fact[]): Fact[] {
  const paired = new Map<string, Fact>();
  for (const fact of facts) {
    const key = `${fact.from}|${fact.to}`;
    const prior = paired.get(key);
    paired.set(
      key,
      prior === undefined
        ? {
            ...fact,
            ...(fact.toPhases === undefined ? {} : { toPhases: new Set(fact.toPhases) }),
          }
        : joinFact(prior, fact),
    );
  }
  return [...paired.values()];
}

function joinFact(prior: Fact, incoming: Fact): Fact {
  const kind = KIND_RANK[incoming.kind] > KIND_RANK[prior.kind] ? incoming.kind : prior.kind;
  const exact =
    incoming.exact !== undefined && prior.exact === undefined
      ? incoming.exact
      : incoming.exact === true
        ? true
        : prior.exact;
  const certainty = incoming.certainty === "maybe" ? "maybe" : prior.certainty;
  const joined = { ...prior };
  if (kind !== prior.kind) joined.kind = kind;
  if (exact !== prior.exact) joined.exact = exact;
  if (certainty !== prior.certainty) joined.certainty = certainty;
  if (incoming.viaJump !== true) delete joined.viaJump;
  if (incoming.toPhases === undefined) delete joined.toPhases;
  else if (joined.toPhases !== undefined) {
    for (const phase of incoming.toPhases) joined.toPhases.add(phase);
  }
  return joined;
}

/** Return maybe if present, otherwise always, including for an empty input. */
export function weakest(values: readonly Certainty[]): Certainty {
  return values.includes("maybe") ? "maybe" : "always";
}
