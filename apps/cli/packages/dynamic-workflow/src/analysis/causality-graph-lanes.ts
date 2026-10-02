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

// causality-graph.ts 顶到 oxlint max-lines 上限（400 行），把成品图上的机械改写与
// 事实层的小工具（may-set 车道展开 expandMaySetLanes 及其两个常量、dedupeFacts、weakest）拆到
// 本文件；公开面仍从 causality-graph.ts 导出。本文件不 import `typescript`。

/**
 * Upper bound on an expandable may-set. Past it the step keeps its single card: a capped
 * may-set FALLS BACK rather than truncating, since dropping candidates would assert
 * something the analysis cannot. The cap keeps the multiplication (k steps, up to k² on a
 * self-carry) well inside the payload limits of 64 steps / 256 edges.
 */
const MAY_SET_LANE_CAP = 4;

/** Copy id separator: collides with neither `ask#3/2` nor the runtime's `ask#3@7`. */
const COPY_SEPARATOR = "~";

/**
 * The LAST pass: rewrite a may-set step into one copy per candidate lane.
 *
 * `(cond ? a : b).ask(p)` is the same program as `cond ? a.ask(p) : b.ask(p)`, and the
 * analyzer already draws the second form as one `maybe` step per lane. Drawing the first
 * form as a single card made the picture depend on where the ternary sits, and on a
 * script whose every ask is a may-set it left candidate lanes with no homed step at all —
 * which the mermaid emitter culls, erasing an actor from the workflow.
 *
 * This runs AFTER ordering and reduction by contract: reduction never sees copies, so
 * every reduction rule and its corpus behaviour are unchanged and this stays a mechanical
 * rewrite of the finished graph.
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

/** Collapse facts to one edge per ordered pair, keeping the strongest claim. */
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

export function weakest(values: readonly Certainty[]): Certainty {
  return values.includes("maybe") ? "maybe" : "always";
}
