// SPDX-License-Identifier: Apache-2.0

import type { OrderEvent, PhaseInfo } from "./causality-order.js";
import { KIND_RANK, reduceOrdering, type OrderKind } from "./causality-reduce.js";
import type { CausalityGraph, Certainty, OrderEdge, Phase, Step } from "./causality-graph.js";
import { UNPHASED_ID } from "./constants.js";

const COPY_SEPARATOR = "~";

interface PhaseClaims {
  bySite: Map<string, string[]>;
  certainty: Map<string, Certainty>;
  firstIssue: Map<string, number>;
  lastIssue: Map<string, number>;
  position: Map<string, number>;
}

export interface PhaseSourceFact {
  from: string;
  to: string;
  kind: OrderKind;
  certainty: Certainty;
  carryOf?: Exclude<OrderKind, "carry">;
  toPhases?: ReadonlySet<string>;
}

interface PhaseCopy extends Step {
  phase: string;
}

interface PhaseEnd {
  certainty: Certainty;
  id: string;
  lane?: string;
  phase: string;
}

function headPhasesOf(
  claiming: readonly string[],
  toPhases: ReadonlySet<string> | undefined,
): string[] {
  if (toPhases === undefined) return [...claiming];
  const narrowed = claiming.filter((phase) => toPhases.has(phase));
  return narrowed.length > 0 ? narrowed : [...claiming];
}

function weakest(values: readonly Certainty[]): Certainty {
  let index = 0;
  while (index < values.length) {
    if (values[index] === "maybe") return "maybe";
    index += 1;
  }
  return "always";
}

function needsAdmission(kind: OrderKind): boolean {
  switch (kind) {
    case "data":
    case "control":
    case "seq":
      return true;
    default:
      return false;
  }
}

export function collectPhaseClaims(
  events: readonly OrderEvent[],
  steps: ReadonlySet<string>,
  certainChain: (chain: readonly string[]) => boolean,
  controlled: ReadonlySet<string>,
): PhaseClaims {
  const bySite = new Map<string, string[]>();
  const position = new Map<string, number>();
  const firstIssue = new Map<string, number>();
  const lastIssue = new Map<string, number>();
  const certainSeen = new Set<string>();
  let clock = 0;
  for (const event of events) {
    if (event.at !== "issue") continue;
    const at = clock;
    clock += 1;
    if (!steps.has(event.step)) continue;
    const claiming = bySite.get(event.step);
    if (claiming === undefined) bySite.set(event.step, [event.phase]);
    else if (!claiming.includes(event.phase)) claiming.push(event.phase);
    if (!position.has(event.phase)) position.set(event.phase, at);
    const key = `${event.step}|${event.phase}`;
    if (!firstIssue.has(key)) firstIssue.set(key, at);
    lastIssue.set(key, at);
    if (certainChain(event.regions)) certainSeen.add(key);
  }
  const certainty = new Map<string, Certainty>();
  for (const [site, claiming] of bySite) {
    for (const phase of claiming) {
      const key = `${site}|${phase}`;
      const certain = certainSeen.has(key) && !controlled.has(site);
      certainty.set(key, certain ? "always" : "maybe");
    }
  }
  return { bySite, certainty, firstIssue, lastIssue, position };
}

function claimsOf(claims: PhaseClaims, siteId: string): string[] {
  return claims.bySite.get(siteId) ?? [UNPHASED_ID];
}

function claimCertainty(claims: PhaseClaims, siteId: string, phase: string): Certainty {
  return claims.certainty.get(`${siteId}|${phase}`) ?? "maybe";
}

function admits(
  claims: PhaseClaims,
  sharesIteration: (a: string, b: string) => boolean,
  from: string,
  fromPhase: string,
  to: string,
  toPhase: string,
): boolean {
  const firstFrom = claims.firstIssue.get(`${from}|${fromPhase}`);
  const lastTo = claims.lastIssue.get(`${to}|${toPhase}`);
  if (firstFrom === undefined || lastTo === undefined) return true;
  return lastTo > firstFrom || sharesIteration(from, to);
}

function buildCopies(graph: CausalityGraph, claims: PhaseClaims): Map<string, PhaseCopy[]> {
  const copiesOf = new Map<string, PhaseCopy[]>();
  for (const step of graph.steps) {
    const siteId = step.source ?? step.id;
    const claiming = claimsOf(claims, siteId);
    if (claiming.length < 2) continue;
    copiesOf.set(
      step.id,
      claiming.map((phase) => ({
        ...step,
        certainty: weakest([step.certainty, claimCertainty(claims, siteId, phase)]),
        id: `${step.id}${COPY_SEPARATOR}${phase}`,
        phase,
        source: siteId,
      })),
    );
  }
  return copiesOf;
}

function phasedSteps(
  graph: CausalityGraph,
  claims: PhaseClaims,
  copiesOf: Map<string, PhaseCopy[]>,
): Step[] {
  return graph.steps.flatMap((step) => {
    const copies = copiesOf.get(step.id);
    if (copies !== undefined) return copies;
    const phase = claimsOf(claims, step.source ?? step.id)[0] as string;
    return [{ ...step, phase }];
  });
}

function provenanceOf(facts: readonly PhaseSourceFact[]): Map<string, ReadonlySet<string>> {
  const provenance = new Map<string, ReadonlySet<string>>();
  for (const fact of facts) {
    if (fact.toPhases !== undefined) provenance.set(`${fact.from}|${fact.to}`, fact.toPhases);
  }
  return provenance;
}

function endpointsOf(
  claims: PhaseClaims,
  copiesOf: Map<string, PhaseCopy[]>,
  stepById: ReadonlyMap<string, Step>,
  id: string,
  toPhases?: ReadonlySet<string>,
): PhaseEnd[] {
  const siteOf = (stepId: string): string => {
    const step = stepById.get(stepId);
    return step === undefined ? stepId : (step.source ?? step.id);
  };
  const copies = copiesOf.get(id);
  if (copies !== undefined) {
    const heads = new Set(headPhasesOf(claimsOf(claims, siteOf(id)), toPhases));
    const selected: PhaseEnd[] = [];
    for (const copy of copies) {
      if (!heads.has(copy.phase)) continue;
      selected.push({ certainty: copy.certainty, id: copy.id, lane: copy.lane, phase: copy.phase });
    }
    return selected;
  }
  const step = stepById.get(id);
  return [
    {
      certainty: step?.certainty ?? "maybe",
      id,
      lane: step?.lane,
      phase: claimsOf(claims, siteOf(id))[0] as string,
    },
  ];
}

function takeAdmitted<T>(pairs: readonly T[], admitted: readonly T[]): readonly T[] {
  return admitted.length > 0 ? admitted : pairs;
}

function rewriteEdge(
  claims: PhaseClaims,
  copiesOf: Map<string, PhaseCopy[]>,
  stepById: ReadonlyMap<string, Step>,
  provenance: ReadonlyMap<string, ReadonlySet<string>>,
  sharesIteration: (a: string, b: string) => boolean,
  edge: OrderEdge,
): OrderEdge[] {
  if (!copiesOf.has(edge.from) && !copiesOf.has(edge.to)) return [edge];
  const siteOf = (id: string): string => {
    const step = stepById.get(id);
    return step === undefined ? id : (step.source ?? step.id);
  };
  const fromSite = siteOf(edge.from);
  const toSite = siteOf(edge.to);
  const pairs: { certainty: Certainty; from: string; to: string }[] = [];
  const admitted: typeof pairs = [];
  const tails = endpointsOf(claims, copiesOf, stepById, edge.from);
  const heads = endpointsOf(
    claims,
    copiesOf,
    stepById,
    edge.to,
    provenance.get(`${fromSite}|${toSite}`),
  );
  for (const tail of tails) {
    for (const head of heads) {
      if (edge.kind === "fifo" && tail.lane !== head.lane) continue;
      if (tail.id === head.id && edge.from !== edge.to) continue;
      const pair = {
        certainty: weakest([edge.certainty, tail.certainty, head.certainty]),
        from: tail.id,
        to: head.id,
      };
      pairs.push(pair);
      if (
        !needsAdmission(edge.kind) ||
        admits(claims, sharesIteration, fromSite, tail.phase, toSite, head.phase)
      ) {
        admitted.push(pair);
      }
    }
  }
  const chosen = takeAdmitted(pairs, admitted);
  return chosen.map((pair) => ({ ...edge, ...pair }));
}

function phaseTable(steps: readonly Step[], phases: readonly PhaseInfo[]): Phase[] {
  const members = new Set<string>();
  for (const step of steps) {
    if (step.phase !== undefined) members.add(step.phase);
  }
  const phaseList: Phase[] = [];
  if (members.has(UNPHASED_ID)) phaseList.push({ id: UNPHASED_ID });
  for (const phase of phases) {
    if (!members.has(phase.id)) continue;
    phaseList.push({ id: phase.id, loc: phase.loc, name: phase.name });
  }
  return phaseList;
}

function quotientFacts(
  claims: PhaseClaims,
  facts: readonly PhaseSourceFact[],
  live: ReadonlySet<string>,
  sharesIteration: (a: string, b: string) => boolean,
): PhaseSourceFact[] {
  const quotient: PhaseSourceFact[] = [];
  for (const fact of facts) {
    const tails = claimsOf(claims, fact.from);
    const heads = headPhasesOf(claimsOf(claims, fact.to), fact.toPhases);
    const copied = tails.length > 1 || claimsOf(claims, fact.to).length > 1;
    const gated = copied && needsAdmission(fact.kind);
    const pairs: { from: string; to: string }[] = [];
    const admitted: typeof pairs = [];
    for (const from of tails) {
      for (const to of heads) {
        pairs.push({ from, to });
        if (!gated || admits(claims, sharesIteration, fact.from, from, fact.to, to))
          admitted.push({ from, to });
      }
    }
    for (const pair of takeAdmitted(pairs, admitted)) {
      if (!live.has(pair.from) || !live.has(pair.to)) continue;
      if (pair.from === pair.to && fact.kind !== "carry") continue;
      quotient.push({
        certainty: fact.certainty,
        from: pair.from,
        kind: fact.kind,
        to: pair.to,
        ...(fact.carryOf === undefined ? {} : { carryOf: fact.carryOf }),
      });
    }
  }
  return quotient;
}

function dedupePhaseFacts(facts: readonly PhaseSourceFact[]): PhaseSourceFact[] {
  const byPair = new Map<string, PhaseSourceFact>();
  for (const fact of facts) {
    const key = `${fact.from}|${fact.to}`;
    const existing = byPair.get(key);
    if (existing === undefined) {
      byPair.set(key, { ...fact });
      continue;
    }
    if (KIND_RANK[fact.kind] > KIND_RANK[existing.kind]) existing.kind = fact.kind;
    if (existing.carryOf === undefined && fact.carryOf !== undefined)
      existing.carryOf = fact.carryOf;
    if (fact.certainty === "maybe") existing.certainty = "maybe";
  }
  return [...byPair.values()];
}

export function projectPhaseGraph(
  graph: CausalityGraph,
  phases: readonly PhaseInfo[],
  claims: PhaseClaims,
  facts: readonly PhaseSourceFact[],
  sharesIteration: (a: string, b: string) => boolean,
): CausalityGraph {
  if (phases.length === 0) return graph;

  const copiesOf = buildCopies(graph, claims);
  const steps = phasedSteps(graph, claims, copiesOf);
  const stepById = new Map(graph.steps.map((step) => [step.id, step]));
  const provenance = provenanceOf(facts);
  const edges: OrderEdge[] = [];
  for (const edge of graph.edges) {
    edges.push(...rewriteEdge(claims, copiesOf, stepById, provenance, sharesIteration, edge));
  }
  const phaseList = phaseTable(steps, phases);
  const live = new Set(phaseList.map((phase) => phase.id));
  const position = (id: string): number => claims.position.get(id) ?? 0;
  const deduped = dedupePhaseFacts(quotientFacts(claims, facts, live, sharesIteration)).sort(
    (left, right) =>
      position(left.from) - position(right.from) ||
      position(left.to) - position(right.to) ||
      left.kind.localeCompare(right.kind),
  );
  const phaseEdges: OrderEdge[] = reduceOrdering(deduped).map((fact) => ({
    certainty: fact.certainty,
    from: fact.from,
    kind: fact.kind,
    to: fact.to,
  }));
  const sink = graph.sink;
  return {
    edges,
    lanes: graph.lanes,
    phaseEdges,
    phases: phaseList,
    regions: graph.regions,
    steps,
    ...(sink === undefined
      ? {}
      : {
          sink: {
            fedBy: sink.fedBy.flatMap((id) =>
              endpointsOf(claims, copiesOf, stepById, id).map((end) => end.id),
            ),
          },
        }),
  };
}
