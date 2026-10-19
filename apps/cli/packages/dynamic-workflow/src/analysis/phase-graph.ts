// SPDX-License-Identifier: Apache-2.0

import type { OrderEvent, PhaseInfo } from "./causality-order.js";
import { KIND_RANK, reduceOrdering, type OrderKind } from "./causality-reduce.js";
import type { CausalityGraph, Certainty, OrderEdge, Phase, Step } from "./causality-graph.js";
import { UNPHASED_ID } from "./constants.js";

const ADMITTED_KINDS: ReadonlySet<OrderKind> = new Set(["data", "control", "seq"]);

type PhaseFactCore = { certainty: Certainty; from: string; to: string; kind: OrderKind };

export interface PhaseSourceFact extends PhaseFactCore {
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

const weakest = (values: readonly Certainty[]): Certainty =>
  values.includes("maybe") ? "maybe" : "always";

function needsAdmission(kind: OrderKind): boolean {
  return ADMITTED_KINDS.has(kind);
}

function pairKey(left: string, right: string): string {
  return [left, right].join("|");
}

function admittedPhases(
  claiming: readonly string[],
  limit: ReadonlySet<string> | undefined,
): string[] {
  if (limit === undefined) return claiming.slice();
  const narrowed = claiming.filter((phase) => limit.has(phase));
  return narrowed.length === 0 ? claiming.slice() : narrowed;
}

// Issue events advance the clock even when the step is not in the projected set.
// Certainty is decided after the scan, so one certain issue covers the pair.
class ClaimScan {
  readonly bySite = new Map<string, string[]>();
  readonly certainty = new Map<string, Certainty>();
  readonly firstIssue = new Map<string, number>();
  readonly lastIssue = new Map<string, number>();
  readonly position = new Map<string, number>();
  private readonly certainSeen = new Set<string>();
  private clock = 0;

  constructor(
    events: readonly OrderEvent[],
    private readonly steps: ReadonlySet<string>,
    private readonly certainChain: (chain: readonly string[]) => boolean,
    private readonly controlled: ReadonlySet<string>,
  ) {
    events.forEach((event) => this.observe(event));
    this.finish();
  }

  snapshot(): PhaseClaims {
    return {
      bySite: this.bySite,
      certainty: this.certainty,
      firstIssue: this.firstIssue,
      lastIssue: this.lastIssue,
      position: this.position,
    };
  }

  private observe(event: OrderEvent): void {
    if (event.at !== "issue") return;
    const at = this.clock;
    this.clock += 1;
    if (!this.steps.has(event.step)) return;
    this.rememberPhase(event.step, event.phase);
    if (!this.position.has(event.phase)) this.position.set(event.phase, at);
    const key = pairKey(event.step, event.phase);
    if (!this.firstIssue.has(key)) this.firstIssue.set(key, at);
    this.lastIssue.set(key, at);
    if (this.certainChain(event.regions)) this.certainSeen.add(key);
  }

  private rememberPhase(step: string, phase: string): void {
    const claiming = this.bySite.get(step);
    if (claiming === undefined) {
      this.bySite.set(step, [phase]);
      return;
    }
    if (!claiming.includes(phase)) claiming.push(phase);
  }

  private finish(): void {
    this.bySite.forEach((claiming, site) => {
      claiming.forEach((phase) => {
        const key = pairKey(site, phase);
        const certain = this.certainSeen.has(key) && !this.controlled.has(site);
        this.certainty.set(key, certain ? "always" : "maybe");
      });
    });
  }
}

type PhaseClaims = {
  bySite: ClaimScan["bySite"];
  certainty: ClaimScan["certainty"];
  firstIssue: ClaimScan["firstIssue"];
  lastIssue: ClaimScan["lastIssue"];
  position: ClaimScan["position"];
};

export function collectPhaseClaims(
  events: readonly OrderEvent[],
  steps: ReadonlySet<string>,
  certainChain: (chain: readonly string[]) => boolean,
  controlled: ReadonlySet<string>,
): PhaseClaims {
  return new ClaimScan(events, steps, certainChain, controlled).snapshot();
}

class PhaseQuotient {
  private readonly copies: Map<string, PhaseCopy[]>;
  private readonly steps: Step[];
  private readonly stepById: ReadonlyMap<string, Step>;
  private readonly provenance: ReadonlyMap<string, ReadonlySet<string>>;

  constructor(
    private readonly graph: CausalityGraph,
    private readonly phases: readonly PhaseInfo[],
    private readonly claims: PhaseClaims,
    private readonly facts: readonly PhaseSourceFact[],
    private readonly sharesIteration: (a: string, b: string) => boolean,
  ) {
    this.copies = this.buildCopies();
    this.steps = this.phasedSteps();
    this.stepById = new Map(graph.steps.map((step) => [step.id, step]));
    this.provenance = this.readProvenance();
  }

  project(): CausalityGraph {
    const edges = this.liftEdges();
    const listed = this.phaseTable();
    const live = new Set<string>();
    listed.forEach((phase) => live.add(phase.id));
    const ordered = this.dedupe(this.quotient(live)).sort((left, right) =>
      this.compareFacts(left, right),
    );
    const phaseEdges = this.dropCarry(reduceOrdering(ordered));
    return this.assemble(edges, phaseEdges, listed);
  }

  private dropCarry(facts: readonly PhaseSourceFact[]): OrderEdge[] {
    const edges: OrderEdge[] = [];
    facts.forEach((fact) =>
      edges.push({ certainty: fact.certainty, from: fact.from, kind: fact.kind, to: fact.to }),
    );
    return edges;
  }

  private assemble(edges: OrderEdge[], phaseEdges: OrderEdge[], listed: Phase[]): CausalityGraph {
    const body: CausalityGraph = {
      edges: edges,
      lanes: this.graph.lanes,
      phaseEdges: phaseEdges,
      phases: listed,
      regions: this.graph.regions,
      steps: this.steps,
    };
    const sink = this.graph.sink;
    if (sink === undefined) return body;
    const fedBy = sink.fedBy.flatMap((id) => this.ends(id).map((end) => end.id));
    return { ...body, sink: { fedBy } };
  }

  private buildCopies(): Map<string, PhaseCopy[]> {
    const copies = new Map<string, PhaseCopy[]>();
    this.graph.steps.forEach((step) => {
      const siteId = step.source ?? step.id;
      const claiming = this.claimList(siteId);
      if (claiming.length < 2) return;
      const made: PhaseCopy[] = [];
      claiming.forEach((phase) => made.push(this.spawnCopy(step, siteId, phase)));
      copies.set(step.id, made);
    });
    return copies;
  }

  private spawnCopy(step: Step, siteId: string, phase: string): PhaseCopy {
    return {
      ...step,
      certainty: weakest([step.certainty, this.claimCertainty(siteId, phase)]),
      id: [step.id, phase].join("~"),
      phase: phase,
      source: siteId,
    };
  }

  private phasedSteps(): Step[] {
    const phased: Step[] = [];
    this.graph.steps.forEach((step) => {
      const copies = this.copies.get(step.id);
      if (copies === undefined) {
        const phase = this.claimList(step.source ?? step.id)[0] ?? UNPHASED_ID;
        phased.push({ ...step, phase });
        return;
      }
      copies.forEach((copy) => phased.push(copy));
    });
    return phased;
  }

  private readProvenance(): Map<string, ReadonlySet<string>> {
    const provenance = new Map<string, ReadonlySet<string>>();
    this.facts.forEach((fact) => {
      if (fact.toPhases !== undefined) provenance.set(pairKey(fact.from, fact.to), fact.toPhases);
    });
    return provenance;
  }

  private liftEdges(): OrderEdge[] {
    const lifted: OrderEdge[] = [];
    this.graph.edges.forEach((edge) => {
      this.rewrite(edge).forEach((next) => lifted.push(next));
    });
    return lifted;
  }

  // An edge whose ends were not copied is the same object. Cross-lane fifo and
  // a collapsed non-self edge are dropped. Admission prefers the admitted pairs.
  private rewrite(edge: OrderEdge): OrderEdge[] {
    if (!this.copies.has(edge.from) && !this.copies.has(edge.to)) return [edge];
    const fromSite = this.siteOf(edge.from);
    const toSite = this.siteOf(edge.to);
    const tails = this.ends(edge.from);
    const heads = this.ends(edge.to, this.provenance.get(pairKey(fromSite, toSite)));
    const pairs: OrderEdge[] = [];
    const admitted: OrderEdge[] = [];
    tails.forEach((tail) => {
      heads.forEach((head) => {
        if (edge.kind === "fifo" && tail.lane !== head.lane) return;
        if (tail.id === head.id && edge.from !== edge.to) return;
        const next: OrderEdge = {
          ...edge,
          certainty: weakest([edge.certainty, tail.certainty, head.certainty]),
          from: tail.id,
          to: head.id,
        };
        pairs.push(next);
        if (!needsAdmission(edge.kind) || this.admits(fromSite, tail.phase, toSite, head.phase)) {
          admitted.push(next);
        }
      });
    });
    return admitted.length > 0 ? admitted : pairs;
  }

  private ends(id: string, limit?: ReadonlySet<string>): PhaseEnd[] {
    const copies = this.copies.get(id);
    if (copies === undefined) {
      const step = this.stepById.get(id);
      const end: PhaseEnd = {
        certainty: step?.certainty ?? "maybe",
        id,
        lane: step?.lane,
        phase: this.claimList(this.siteOf(id))[0] ?? UNPHASED_ID,
      };
      return [end];
    }
    const allowed = new Set(admittedPhases(this.claimList(this.siteOf(id)), limit));
    const selected: PhaseEnd[] = [];
    copies.forEach((copy) => {
      if (!allowed.has(copy.phase)) return;
      selected.push({ certainty: copy.certainty, id: copy.id, lane: copy.lane, phase: copy.phase });
    });
    return selected;
  }

  private quotient(live: ReadonlySet<string>): PhaseSourceFact[] {
    const quotient: PhaseSourceFact[] = [];
    this.facts.forEach((fact) => {
      const tails = this.claimList(fact.from);
      const heads = admittedPhases(this.claimList(fact.to), fact.toPhases);
      const copied = tails.length > 1 || this.claimList(fact.to).length > 1;
      const gated = copied && needsAdmission(fact.kind);
      const pairs: Array<{ from: string; to: string }> = [];
      const admitted: Array<{ from: string; to: string }> = [];
      tails.forEach((from) => {
        heads.forEach((to) => {
          const pair = { from, to };
          pairs.push(pair);
          if (!gated || this.admits(fact.from, from, fact.to, to)) admitted.push(pair);
        });
      });
      const chosen = admitted.length > 0 ? admitted : pairs;
      chosen.forEach((pair) => {
        if (!live.has(pair.from) || !live.has(pair.to)) return;
        if (pair.from === pair.to && fact.kind !== "carry") return;
        quotient.push(this.phaseFact(fact, pair.from, pair.to));
      });
    });
    return quotient;
  }

  private phaseFact(fact: PhaseSourceFact, from: string, to: string): PhaseSourceFact {
    const lifted: PhaseSourceFact = { certainty: fact.certainty, from, kind: fact.kind, to };
    if (fact.carryOf !== undefined) lifted.carryOf = fact.carryOf;
    return lifted;
  }

  private dedupe(facts: readonly PhaseSourceFact[]): PhaseSourceFact[] {
    const kept = new Map<string, PhaseSourceFact>();
    facts.forEach((fact) => this.absorb(kept, fact));
    return [...kept.values()];
  }

  private absorb(kept: Map<string, PhaseSourceFact>, fact: PhaseSourceFact): void {
    const key = pairKey(fact.from, fact.to);
    const prior = kept.get(key);
    if (prior === undefined) {
      kept.set(key, { ...fact });
      return;
    }
    if (KIND_RANK[fact.kind] > KIND_RANK[prior.kind]) prior.kind = fact.kind;
    if (prior.carryOf === undefined && fact.carryOf !== undefined) prior.carryOf = fact.carryOf;
    if (fact.certainty === "maybe") prior.certainty = "maybe";
  }

  private phaseTable(): Phase[] {
    const members = new Set<string>();
    this.steps.forEach((step) => {
      if (step.phase !== undefined) members.add(step.phase);
    });
    const listed: Phase[] = [];
    if (members.has(UNPHASED_ID)) listed.push({ id: UNPHASED_ID });
    this.phases.forEach((phase) => {
      if (!members.has(phase.id)) return;
      listed.push({ id: phase.id, loc: phase.loc, name: phase.name });
    });
    return listed;
  }

  private compareFacts(left: PhaseSourceFact, right: PhaseSourceFact): number {
    const position = (id: string): number => this.claims.position.get(id) ?? 0;
    const fromDelta = position(left.from) - position(right.from);
    if (fromDelta !== 0) return fromDelta;
    const toDelta = position(left.to) - position(right.to);
    if (toDelta !== 0) return toDelta;
    return left.kind.localeCompare(right.kind);
  }

  private admits(from: string, fromPhase: string, to: string, toPhase: string): boolean {
    const opened = this.claims.firstIssue.get(pairKey(from, fromPhase));
    const closed = this.claims.lastIssue.get(pairKey(to, toPhase));
    if (opened === undefined || closed === undefined) return true;
    return closed > opened || this.sharesIteration(from, to);
  }

  private claimList(siteId: string): string[] {
    return this.claims.bySite.get(siteId) ?? [UNPHASED_ID];
  }

  private claimCertainty(siteId: string, phase: string): Certainty {
    return this.claims.certainty.get(pairKey(siteId, phase)) ?? "maybe";
  }

  private siteOf(stepId: string): string {
    const step = this.stepById.get(stepId);
    if (step === undefined) return stepId;
    return step.source ?? step.id;
  }
}

export function projectPhaseGraph(
  graph: CausalityGraph,
  phases: readonly PhaseInfo[],
  claims: PhaseClaims,
  facts: readonly PhaseSourceFact[],
  sharesIteration: (a: string, b: string) => boolean,
): CausalityGraph {
  if (phases.length === 0) return graph;
  return new PhaseQuotient(graph, phases, claims, facts, sharesIteration).project();
}
