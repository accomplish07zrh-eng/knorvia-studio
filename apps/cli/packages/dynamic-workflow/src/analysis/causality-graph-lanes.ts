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
  const byPair = new Map<string, Fact>();
  for (const fact of facts) {
    const key = `${fact.from}|${fact.to}`;
    const existing = byPair.get(key);
    if (existing === undefined) {
      // The phase set is cloned, not aliased: the merge below mutates it in place and the
      // input facts must stay untouched.
      byPair.set(key, {
        ...fact,
        ...(fact.toPhases === undefined ? {} : { toPhases: new Set(fact.toPhases) }),
      });
      continue;
    }
    if (KIND_RANK[fact.kind] > KIND_RANK[existing.kind]) existing.kind = fact.kind;
    if (fact.exact !== undefined && existing.exact === undefined) existing.exact = fact.exact;
    else if (fact.exact === true) existing.exact = true;
    if (fact.certainty === "maybe") existing.certainty = "maybe";
    // 一条不经跳转就成立的事实让这一对回到普通前向边：全部贡献都只能靠下一轮，才算回边。
    if (fact.viaJump !== true) delete existing.viaJump;
    // ABSENT DOMINATES: one contributing fact with no provenance means the merged fact has
    // none, so it fans out fully. A `data` fact (never provenanced, and fanning out by
    // contract) merging onto a provenanced `seq` fact must not inherit that narrowing —
    // the pair is then ordered for reasons the barrier witness does not account for.
    if (fact.toPhases === undefined) delete existing.toPhases;
    else if (existing.toPhases !== undefined) {
      for (const phase of fact.toPhases) existing.toPhases.add(phase);
    }
  }
  return [...byPair.values()];
}

export function weakest(values: readonly Certainty[]): Certainty {
  return values.includes("maybe") ? "maybe" : "always";
}
