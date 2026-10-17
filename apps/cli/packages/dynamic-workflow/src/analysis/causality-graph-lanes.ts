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
const MAX_CHOICE_LANES = 4;
// Separator in projected lane-copy ids.
const COPY_ID_DELIMITER = "~";
const COPY_CERTAINTY: Certainty = "maybe";

interface LaneSubstitution {
  copies?: Step[];
  original?: Step;
}

type LaneIndex = Map<string, LaneSubstitution>;

interface LaneEndpoint {
  certainty?: Certainty;
  id: string;
  lane?: string;
}

function expandableChoices(unit: Step): string[] {
  const choices = unit.lanes ?? [];
  const worthSplitting = choices.length > 1 && choices.length <= MAX_CHOICE_LANES;
  if (!worthSplitting) return [];
  const unnamed = choices.some((choice) => choice === WORKSPACE_LANE || choice === UNKNOWN_LANE);
  return unnamed ? [] : choices;
}

function projectCopy(unit: Step, laneName: string): Step {
  const copy: Step = {
    ...unit,
    certainty: COPY_CERTAINTY,
    id: `${unit.id}${COPY_ID_DELIMITER}${laneName}`,
    lane: laneName,
    source: unit.id,
  };
  return copy;
}

function copiesFor(unit: Step): Step[] {
  return expandableChoices(unit).map((laneName) => projectCopy(unit, laneName));
}

function keepOriginals(index: LaneIndex, units: readonly Step[]): void {
  for (const unit of units) {
    const plan = index.get(unit.id);
    index.set(unit.id, plan === undefined ? { original: unit } : { ...plan, original: unit });
  }
}

function plainEndpoint(index: LaneIndex, id: string): LaneEndpoint {
  const original = index.get(id)?.original;
  return { certainty: original?.certainty, id, lane: original?.lane };
}

function endpointsAt(index: LaneIndex, id: string): readonly LaneEndpoint[] {
  const copies = index.get(id)?.copies;
  if (copies !== undefined) return copies;
  return [plainEndpoint(index, id)];
}

function pairConnected(link: OrderEdge, source: LaneEndpoint, destination: LaneEndpoint): boolean {
  return link.kind !== "fifo" || source.lane === destination.lane;
}

function joinedEdge(link: OrderEdge, source: LaneEndpoint, destination: LaneEndpoint): OrderEdge {
  const certainty = weakest([
    link.certainty,
    source.certainty ?? link.certainty,
    destination.certainty ?? link.certainty,
  ]);
  return { ...link, certainty, from: source.id, to: destination.id };
}

function reroute(index: LaneIndex, link: OrderEdge): OrderEdge[] {
  const sources = index.get(link.from)?.copies;
  const targets = index.get(link.to)?.copies;
  if (sources === undefined && targets === undefined) return [link];
  const joined: OrderEdge[] = [];
  for (const source of sources ?? [plainEndpoint(index, link.from)]) {
    for (const target of targets ?? [plainEndpoint(index, link.to)]) {
      if (pairConnected(link, source, target)) joined.push(joinedEdge(link, source, target));
    }
  }
  return joined;
}

function widenedGraph(index: LaneIndex, graph: CausalityGraph): CausalityGraph {
  const routed: OrderEdge[] = [];
  for (const link of graph.edges) routed.push(...reroute(index, link));
  const expanded = graph.steps.flatMap((unit) => index.get(unit.id)?.copies ?? [unit]);
  const { sink } = graph;
  const { lanes, regions } = graph;
  const widened: CausalityGraph = { edges: routed, lanes, regions, steps: expanded };
  if (sink === undefined) return widened;
  const fedBy = sink.fedBy.flatMap((id) => endpointsAt(index, id).map((node) => node.id));
  return { ...widened, sink: { fedBy } };
}

/**
 * Expand candidate lane sets after reduction and before phase projection.
 * Return the input unchanged when no step expands. Copies retain their source site
 * and have maybe certainty; FIFO wiring connects equal lanes only.
 */
export function expandMaySetLanes(graph: CausalityGraph): CausalityGraph {
  const index: LaneIndex = new Map();
  // Only admitted replacements populate the plan before the identity decision.
  for (const unit of graph.steps) {
    const copies = copiesFor(unit);
    if (copies.length > 0) index.set(unit.id, { copies });
  }
  if (index.size === 0) return graph;
  // Original lookup and replacements share one entry; a later original cannot erase copies.
  keepOriginals(index, graph.steps);
  return widenedGraph(index, graph);
}

function snapshotFact(row: Fact): Fact {
  if (row.toPhases === undefined) return { ...row };
  return { ...row, toPhases: new Set(row.toPhases) };
}

function strongerKind(kept: Fact, row: Fact): Fact["kind"] {
  return KIND_RANK[row.kind] > KIND_RANK[kept.kind] ? row.kind : kept.kind;
}

function carriedExactness(kept: Fact, row: Fact): boolean | undefined {
  if (row.exact !== undefined && kept.exact === undefined) return row.exact;
  return row.exact === true ? true : kept.exact;
}

function mergedFact(kept: Fact, row: Fact): Fact {
  const merged = { ...kept };
  const kind = strongerKind(kept, row);
  const exact = carriedExactness(kept, row);
  if (kind !== kept.kind) merged.kind = kind;
  if (exact !== kept.exact) merged.exact = exact;
  const certainty = weakest([kept.certainty, row.certainty]);
  if (certainty !== kept.certainty) merged.certainty = certainty;
  if (row.viaJump !== true) delete merged.viaJump;
  const phases = merged.toPhases;
  if (row.toPhases === undefined) delete merged.toPhases;
  else if (phases !== undefined) for (const phase of row.toPhases) phases.add(phase);
  return merged;
}

/**
 * Join ordered-pair facts in first-key order without mutating input records or phase sets.
 * Higher rank and true exactness win; maybe, absent provenance and non-jump witnesses dominate.
 */
export function dedupeFacts(facts: readonly Fact[]): Fact[] {
  const pairs = new Map<string, Fact>();
  for (const row of facts) {
    const key = `${row.from}|${row.to}`;
    const kept = pairs.get(key);
    pairs.set(key, kept === undefined ? snapshotFact(row) : mergedFact(kept, row));
  }
  return [...pairs.values()];
}

/** Return maybe if present, otherwise always, including for an empty input. */
export function weakest(values: readonly Certainty[]): Certainty {
  if (values.includes("maybe")) return "maybe";
  return "always";
}
