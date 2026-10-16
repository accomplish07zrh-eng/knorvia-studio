// SPDX-License-Identifier: Apache-2.0

import type { ActorEvent, IssueEvent, JumpEvent, OrderRegion, SettleEvent } from "./causality-order.js";
import { reduceOrdering, type OrderKind } from "./causality-reduce.js";
import { dedupeFacts, expandMaySetLanes, weakest } from "./causality-graph-lanes.js";
import {
  SINK_ID,
  UNKNOWN_LANE,
  WORKSPACE_LANE,
  type CausalityGraph,
  type Certainty,
  type Fact,
  type Lane,
  type OrderEdge,
  type Region,
  type Step,
  type StepKind,
} from "./causality-graph-types.js";
import { isStructuralRegionKind, type RegionKind, type TraceRegionKind } from "./constants.js";
import type { AnalysisCore } from "./core.js";
import { collectPhaseClaims, projectPhaseGraph, type PhaseSourceFact } from "./phase-graph.js";
import type { SiteGraph, SiteLoc, SiteNode } from "./types.js";

export type { NamePattern } from "./types.js";
export { SINK_ID, UNKNOWN_LANE, WORKSPACE_LANE } from "./causality-graph-types.js";
export type { CausalityGraph, Certainty, Lane, OrderEdge, Phase, Region, Step, StepKind } from "./causality-graph-types.js";
export type { OrderKind, RegionKind };

type Placed = SiteNode & { loc: SiteLoc };
type JumpWord = "break" | "continue";

function placedSteps(site: SiteGraph): Placed[] {
  const placed: Placed[] = [];
  site.nodes.forEach((node) => {
    if (node.loc !== undefined && (node.kind === "ask" || node.kind === "world-read")) placed.push(node as Placed);
  });
  return placed;
}

// Settlement is observed as of each issue, so the trace is folded in event order.
class CausalityPass {
  private readonly trace: AnalysisCore["trace"];
  private readonly regionById: Map<string, OrderRegion>;
  private readonly facts: Fact[] = [];
  private readonly minIssue = new Map<string, number>();
  private readonly maxIssue = new Map<string, number>();
  private readonly innermost = new Map<string, string>();
  private readonly regionsOf = new Map<string, Set<string>>();
  private readonly unconditional = new Set<string>();
  private readonly actorRegions = new Map<string, readonly string[]>();
  private readonly settled = new Map<string, Map<string, boolean>>();
  private readonly settledInside = new Map<string, Set<string>>();
  private readonly deferred = new Map<string, Map<string, JumpWord>>();
  private readonly controlled = new Set<string>();
  private readonly laneSet = new Map<string, string[]>();
  private readonly repeat = new Map<string, "stack" | "serial">();
  private readonly keep = new Set<string>();
  private readonly rename = new Map<string, string>();
  private clock = 0;

  constructor(core: AnalysisCore, private readonly site: SiteGraph) {
    this.trace = core.trace;
    this.regionById = new Map(this.trace.regions.map((region) => [region.id, region]));
  }

  project(): CausalityGraph {
    this.trace.events.forEach((event) => {
      if (event.at === "issue") this.noteIssue(event);
      else if (event.at === "settle") this.noteSettle(event);
      else if (event.at === "jump") this.noteJump(event);
      else if (event.at === "actor") this.rememberActor(event);
    });
    const nodes = placedSteps(this.site);
    const stepIds = new Set(nodes.map((node) => node.id));
    nodes.forEach((node) => this.laneSet.set(node.id, this.lanesFor(node)));
    this.addControls(nodes, stepIds);
    this.addData(stepIds);
    const issueOrder = nodes.slice().sort((left, right) => this.position(left.id) - this.position(right.id));
    this.addFifo(issueOrder);
    this.closeIterations(issueOrder);
    const published = this.publish(reduceOrdering(this.retype(dedupeFacts(this.facts))));
    published.edges.sort((left, right) => this.position(left.from) - this.position(right.from) || this.position(left.to) - this.position(right.to) || left.kind.localeCompare(right.kind));
    published.fedBy.sort((left, right) => this.position(left) - this.position(right));
    const lanes = this.assembleLanes(nodes);
    this.retainUsed(nodes, lanes);
    const regions = this.assembleRegions();
    const renamed = (id: string): string => this.rename.get(id) ?? id;
    return projectPhaseGraph(
      expandMaySetLanes({
        edges: published.edges,
        lanes: lanes.map((lane) => (lane.families === undefined ? lane : { ...lane, families: lane.families.map(renamed) })),
        regions,
        steps: this.assembleSteps(nodes, renamed),
        ...(published.fedBy.length > 0 ? { sink: { fedBy: published.fedBy } } : {}),
      }),
      this.trace.phases,
      collectPhaseClaims(this.trace.events, stepIds, (chain) => this.certainChain(chain), this.controlled),
      published.phaseFacts,
      (left, right) => this.shares(left, right),
    );
  }

  private noteJump(event: JumpEvent): void {
    const kind = event.kind;
    if (kind !== "break" && kind !== "continue") return;
    const arm = this.armBefore(event.regions, event.target);
    if (arm === undefined || !event.regions.includes(event.target)) return;
    this.regionsOf.forEach((regions, step) => {
      if (!regions.has(arm)) return;
      const loops = this.deferred.get(step) ?? new Map<string, JumpWord>();
      loops.set(event.target, kind);
      this.deferred.set(step, loops);
    });
  }

  private noteSettle(event: SettleEvent): void {
    const frame = this.frame(event.regions);
    event.steps.forEach((step) => {
      const byFrame = this.settled.get(step) ?? new Map<string, boolean>();
      const prior = byFrame.get(frame);
      // A later certain settle upgrades a maybe one. A certain settle stays certain.
      if (prior === undefined || (prior && !event.maybe)) byFrame.set(frame, event.maybe);
      this.settled.set(step, byFrame);
    });
    event.regions.forEach((id) => {
      const held = this.settledInside.get(id) ?? new Set<string>();
      event.steps.forEach((step) => held.add(step));
      this.settledInside.set(id, held);
    });
  }

  private rememberActor(event: ActorEvent): void {
    if (!this.actorRegions.has(event.actor)) this.actorRegions.set(event.actor, event.regions);
  }

  private noteIssue(event: IssueEvent): void {
    const at = this.clock;
    this.clock += 1;
    if (!this.minIssue.has(event.step)) {
      this.minIssue.set(event.step, at);
      this.innermost.set(event.step, this.home(event.regions));
    }
    this.maxIssue.set(event.step, at);
    const seen = this.regionsOf.get(event.step) ?? new Set<string>();
    event.regions.forEach((id) => seen.add(id));
    this.regionsOf.set(event.step, seen);
    if (this.certainChain(event.regions)) this.unconditional.add(event.step);
    const visible = this.visibleFrames(event.regions);
    this.settled.forEach((byFrame, from) => {
      if (from === event.step) return;
      const mayHaveSettled = this.meetMaybe(byFrame, visible);
      if (mayHaveSettled === undefined) return;
      const continuation = this.continuation(from, event.regions);
      if (continuation === "drop") return;
      this.facts.push({
        certainty: mayHaveSettled ? "maybe" : "always", from, kind: "seq", to: event.step,
        toPhases: new Set([event.phase]),
        ...(continuation === "jump" ? { viaJump: true as const } : {}),
      });
    });
  }

  private addControls(nodes: readonly Placed[], stepIds: ReadonlySet<string>): void {
    const link = (controllers: readonly string[], stepId: string, certainty: Certainty): void => {
      controllers.forEach((controller) => {
        if (controller === stepId || !stepIds.has(controller)) return;
        this.facts.push({ certainty, from: controller, kind: "control", to: stepId });
      });
    };
    this.trace.controls.forEach((control) => {
      nodes.forEach((step) => {
        if (!(this.regionsOf.get(step.id)?.has(control.region) ?? false)) return;
        this.controlled.add(step.id);
        link(control.controllers, step.id, "always");
        link(control.maybeControllers, step.id, "maybe");
      });
    });
  }

  private addData(stepIds: ReadonlySet<string>): void {
    this.site.edges.forEach((edge) => {
      if (edge.kind !== "data" || !stepIds.has(edge.from)) return;
      if (edge.to !== SINK_ID && !stepIds.has(edge.to)) return;
      this.facts.push({ certainty: "always", exact: edge.exact, from: edge.from, kind: "data", to: edge.to });
    });
  }

  private addFifo(issueOrder: readonly Placed[]): void {
    issueOrder.forEach((earlier, left) => {
      issueOrder.slice(left + 1).forEach((later) => {
        const lanesA = this.realLanes(earlier.id);
        const lanesB = this.realLanes(later.id);
        if (!lanesA.some((lane) => lanesB.includes(lane))) return;
        const certainty: Certainty = lanesA.length === 1 && lanesB.length === 1 ? "always" : "maybe";
        this.facts.push({ certainty, from: earlier.id, kind: "fifo", to: later.id });
      });
    });
  }

  private closeIterations(issueOrder: readonly Placed[]): void {
    this.trace.regions.forEach((region) => {
      if (region.kind !== "loop" && region.kind !== "fanout") return;
      const inside = issueOrder.filter((node) => this.regionsOf.get(node.id)?.has(region.id) ?? false);
      const first = inside[0];
      if (first === undefined) return;
      const settledHere = inside.filter((node) => this.settledInside.get(region.id)?.has(node.id) ?? false);
      const last = settledHere.at(-1);
      if (last !== undefined) this.facts.push({ certainty: this.certaintyOf(last.id), from: last.id, kind: "seq", to: first.id });
      settledHere.forEach((node) => this.markRepeat(node.id, "serial"));
      const awaited = new Set(settledHere.map((node) => node.id));
      inside.forEach((node) => {
        if (awaited.has(node.id)) return;
        const lanes = this.realLanes(node.id);
        const only = lanes[0];
        if (lanes.length === 1 && only !== undefined && this.familiesOf(only).length === 0) {
          this.facts.push({ certainty: this.certaintyOf(node.id), from: node.id, kind: "fifo", to: node.id });
          this.markRepeat(node.id, "serial");
          return;
        }
        this.markRepeat(node.id, "stack");
      });
    });
  }

  private retype(facts: readonly Fact[]): Fact[] {
    const typed: Fact[] = [];
    facts.forEach((fact) => {
      const back = fact.viaJump === true || fact.from === fact.to || this.lastIssue(fact.to) <= this.position(fact.from);
      if (!back) {
        typed.push(fact);
        return;
      }
      const self = fact.from === fact.to;
      const repeated = self
        ? this.iterationRegions(fact.to).length > 0 || this.lastIssue(fact.to) > this.position(fact.to)
        : this.shares(fact.from, fact.to);
      if (!repeated) return;
      const kind = fact.kind;
      typed.push({
        certainty: fact.certainty, from: fact.from, kind: "carry", to: fact.to,
        ...(fact.toPhases === undefined ? {} : { toPhases: fact.toPhases }),
        ...(fact.viaJump === true ? { viaJump: true as const } : {}),
        ...(kind === "carry" ? (fact.carryOf === undefined ? {} : { carryOf: fact.carryOf }) : { carryOf: kind }),
      });
    });
    return typed;
  }

  private publish(reduced: readonly Fact[]): { edges: OrderEdge[]; fedBy: string[]; phaseFacts: PhaseSourceFact[] } {
    const edges: OrderEdge[] = [];
    const fedBy: string[] = [];
    const phaseFacts: PhaseSourceFact[] = [];
    reduced.forEach((fact) => {
      const certainty = weakest([fact.certainty, this.certaintyOf(fact.from), this.certaintyOf(fact.to)]);
      if (fact.to === SINK_ID) {
        fedBy.push(fact.from);
        return;
      }
      phaseFacts.push({
        certainty, from: fact.from, kind: fact.kind, to: fact.to,
        ...(fact.carryOf === undefined ? {} : { carryOf: fact.carryOf }),
        ...(fact.toPhases === undefined ? {} : { toPhases: fact.toPhases }),
      });
      const published: OrderEdge = { certainty, from: fact.from, kind: fact.kind, to: fact.to };
      edges.push(fact.kind === "data" && fact.exact !== undefined ? { ...published, exact: fact.exact } : published);
    });
    return { edges, fedBy, phaseFacts };
  }

  private assembleLanes(nodes: readonly Placed[]): Lane[] {
    const used = new Set<string>();
    nodes.forEach((node) => (this.laneSet.get(node.id) ?? []).forEach((lane) => used.add(lane)));
    const lanes: Lane[] = [];
    if (used.has(WORKSPACE_LANE)) lanes.push({ id: WORKSPACE_LANE });
    this.site.actors.forEach((actor) => {
      if (!used.has(actor.id)) return;
      const families = this.familiesOf(actor.id);
      lanes.push({
        id: actor.id, loc: actor.loc,
        ...(actor.name === undefined ? {} : { name: actor.name }),
        ...(actor.namePattern === undefined ? {} : { namePattern: actor.namePattern }),
        ...(families.length > 0 ? { families } : {}),
      });
    });
    if (used.has(UNKNOWN_LANE)) lanes.push({ id: UNKNOWN_LANE });
    return lanes;
  }

  private assembleRegions(): Region[] {
    const counters = new Map<RegionKind, number>();
    const regions: Region[] = [];
    this.trace.regions.forEach((region) => {
      if (!this.keep.has(region.id) || isStructuralRegionKind(region.kind)) return;
      const next = (counters.get(region.kind) ?? 0) + 1;
      counters.set(region.kind, next);
      const id = `${region.kind}#${String(next)}`;
      this.rename.set(region.id, id);
      const visible = this.structuralParent(region);
      const parent = visible === undefined ? undefined : this.rename.get(visible);
      regions.push({
        id, kind: region.kind,
        ...(parent === undefined ? {} : { parent }),
        ...(region.loc === undefined ? {} : { loc: region.loc }),
        ...(region.bound === undefined ? {} : { bound: region.bound }),
        ...(region.label === undefined ? {} : { label: region.label }),
      });
    });
    return regions;
  }

  private assembleSteps(nodes: readonly Placed[], renamed: (id: string) => string): Step[] {
    return nodes.map((node) => {
      const lanesForNode = this.laneSet.get(node.id) ?? [UNKNOWN_LANE];
      const repeats = this.repeat.get(node.id);
      return {
        certainty: this.certaintyOf(node.id), id: node.id, kind: node.kind as StepKind, label: node.label,
        ...(node.labelPattern === undefined ? {} : { labelPattern: node.labelPattern }),
        lane: lanesForNode[0] ?? UNKNOWN_LANE, loc: node.loc,
        region: renamed(this.innermost.get(node.id) ?? this.trace.root),
        ...(lanesForNode.length > 1 ? { lanes: lanesForNode } : {}),
        ...(repeats === undefined ? {} : { repeat: repeats }),
      };
    });
  }

  private certainChain(chain: readonly string[]): boolean {
    return chain.every((id) => {
      const region = this.regionById.get(id);
      if (region === undefined) return false;
      const kind = region.kind;
      return isStructuralRegionKind(kind) || kind === "seq" || kind === "parallel" || (kind === "loop" && region.entered);
    });
  }

  private home(chain: readonly string[]): string {
    for (const id of [...chain].reverse()) {
      const kind = this.kindOf(id);
      if (kind !== undefined && !isStructuralRegionKind(kind)) return id;
    }
    return this.trace.root;
  }

  private frame(regions: readonly string[]): string {
    for (const id of [...regions].reverse()) if (this.regionById.get(id)?.strand === true) return id;
    return this.trace.root;
  }

  private visibleFrames(regions: readonly string[]): Set<string> {
    const visible = new Set<string>([this.trace.root]);
    regions.forEach((id) => { if (this.regionById.get(id)?.strand === true) visible.add(id); });
    return visible;
  }

  private armBefore(regions: readonly string[], target: string): string | undefined {
    let arm: string | undefined;
    for (const id of [...regions].reverse()) { if (id === target) break; if (this.kindOf(id) === "branch") arm = id; }
    return arm;
  }

  private structuralParent(region: OrderRegion): string | undefined {
    let cursor = region.parent === undefined ? undefined : this.regionById.get(region.parent);
    while (cursor !== undefined && isStructuralRegionKind(cursor.kind)) {
      cursor = cursor.parent === undefined ? undefined : this.regionById.get(cursor.parent);
    }
    return cursor?.id;
  }

  private meetMaybe(byFrame: ReadonlyMap<string, boolean>, visible: ReadonlySet<string>): boolean | undefined {
    let meet: boolean | undefined;
    byFrame.forEach((maybe, frame) => { if (visible.has(frame)) meet = meet === undefined ? maybe : meet && maybe; });
    return meet;
  }

  private continuation(from: string, regions: readonly string[]): "drop" | "jump" | "flow" {
    const loops = this.deferred.get(from);
    if (loops === undefined) return "flow";
    let blocked = false;
    let jumped = false;
    loops.forEach((kind, loop) => {
      if (!regions.includes(loop)) return;
      if (kind === "break") blocked = true; else jumped = true;
    });
    if (blocked) return "drop";
    return jumped ? "jump" : "flow";
  }

  private retainUsed(nodes: readonly Placed[], lanes: readonly Lane[]): void {
    const retain = (start: string | undefined): void => {
      let current = start;
      while (current !== undefined && !this.keep.has(current)) { this.keep.add(current); current = this.regionById.get(current)?.parent; }
    };
    nodes.forEach((node) => retain(this.innermost.get(node.id) ?? this.trace.root));
    lanes.forEach((lane) => (lane.families ?? []).forEach((family) => retain(family)));
  }

  private kindOf(id: string): TraceRegionKind | undefined { return this.regionById.get(id)?.kind; }
  private lanesFor(node: SiteNode): string[] {
    if (node.kind === "world-read") return [WORKSPACE_LANE];
    const actors = node.actors ?? [];
    return actors.length > 0 ? actors.slice() : [UNKNOWN_LANE];
  }
  private familiesOf(actorId: string): string[] {
    return this.iterationLike(this.actorRegions.get(actorId) ?? []);
  }
  private realLanes(step: string): string[] {
    return (this.laneSet.get(step) ?? []).filter((lane) => lane !== WORKSPACE_LANE && lane !== UNKNOWN_LANE);
  }
  private markRepeat(step: string, mode: "stack" | "serial"): void {
    if (mode === "serial" || !this.repeat.has(step)) this.repeat.set(step, mode);
  }
  private certaintyOf(step: string): Certainty {
    return this.unconditional.has(step) && !this.controlled.has(step) ? "always" : "maybe";
  }
  private position(id: string): number {
    return id === SINK_ID ? Number.MAX_SAFE_INTEGER : (this.minIssue.get(id) ?? 0);
  }
  private lastIssue(id: string): number {
    return id === SINK_ID ? Number.MAX_SAFE_INTEGER : (this.maxIssue.get(id) ?? 0);
  }
  private iterationRegions(id: string): string[] { return this.iterationLike(this.regionsOf.get(id) ?? []); }
  private iterationLike(ids: Iterable<string>): string[] {
    return [...ids].filter((id) => { const kind = this.kindOf(id); return kind === "loop" || kind === "fanout"; });
  }
  private shares(left: string, right: string): boolean {
    const enclosing = new Set(this.iterationRegions(right));
    return this.iterationRegions(left).some((region) => enclosing.has(region));
  }
}

export function projectCausalityGraph(core: AnalysisCore, site: SiteGraph): CausalityGraph {
  return new CausalityPass(core, site).project();
}
