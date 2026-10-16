// SPDX-License-Identifier: Apache-2.0

import type {
  ActorEvent,
  IssueEvent,
  JumpEvent,
  OrderRegion,
  SettleEvent,
} from "./causality-order.js";
import { reduceOrdering, type OrderKind } from "./causality-reduce.js";
import { dedupeFacts, expandMaySetLanes } from "./causality-graph-lanes.js";
import {
  SINK_ID,
  type CausalityGraph,
  type Certainty,
  type Fact,
} from "./causality-graph-types.js";
import type { RegionKind } from "./constants.js";
import type { AnalysisCore } from "./core.js";
import { collectPhaseClaims, projectPhaseGraph } from "./phase-graph.js";
import type { SiteGraph } from "./types.js";
import {
  assembleLanes,
  assembleRegions,
  assembleSteps,
  publish,
  retainUsed,
  type Placed,
} from "./causality-graph/assemble.js";
import {
  armBefore,
  certainChain,
  certaintyOf,
  continuation,
  familiesOf,
  frame,
  home,
  iterationRegions,
  lanesFor,
  lastIssue,
  markRepeat,
  meetMaybe,
  position,
  realLanes,
  shares,
  visibleFrames,
} from "./causality-graph/regions.js";

export type { NamePattern } from "./types.js";
export { SINK_ID, UNKNOWN_LANE, WORKSPACE_LANE } from "./causality-graph-types.js";
export type {
  CausalityGraph,
  Certainty,
  Lane,
  OrderEdge,
  Phase,
  Region,
  Step,
  StepKind,
} from "./causality-graph-types.js";
export type { OrderKind, RegionKind };

type JumpWord = "break" | "continue";

function placedSteps(site: SiteGraph): Placed[] {
  const placed: Placed[] = [];
  site.nodes.forEach((node) => {
    if (node.loc !== undefined && (node.kind === "ask" || node.kind === "world-read"))
      placed.push(node as Placed);
  });
  return placed;
}

// Settlement is observed as of each issue, so the trace is folded in event order.
class CausalityPass {
  readonly trace: AnalysisCore["trace"];
  readonly regionById: Map<string, OrderRegion>;
  private readonly facts: Fact[] = [];
  readonly minIssue = new Map<string, number>();
  readonly maxIssue = new Map<string, number>();
  readonly innermost = new Map<string, string>();
  readonly regionsOf = new Map<string, Set<string>>();
  readonly unconditional = new Set<string>();
  readonly actorRegions = new Map<string, readonly string[]>();
  private readonly settled = new Map<string, Map<string, boolean>>();
  private readonly settledInside = new Map<string, Set<string>>();
  readonly deferred = new Map<string, Map<string, JumpWord>>();
  readonly controlled = new Set<string>();
  readonly laneSet = new Map<string, string[]>();
  readonly repeat = new Map<string, "stack" | "serial">();
  readonly keep = new Set<string>();
  readonly rename = new Map<string, string>();
  private clock = 0;

  constructor(
    core: AnalysisCore,
    readonly site: SiteGraph,
  ) {
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
    nodes.forEach((node) => this.laneSet.set(node.id, lanesFor(node)));
    this.addControls(nodes, stepIds);
    this.addData(stepIds);
    const issueOrder = nodes
      .slice()
      .sort((left, right) => position(this, left.id) - position(this, right.id));
    this.addFifo(issueOrder);
    this.closeIterations(issueOrder);
    const published = publish(this, reduceOrdering(this.retype(dedupeFacts(this.facts))));
    published.edges.sort(
      (left, right) =>
        position(this, left.from) - position(this, right.from) ||
        position(this, left.to) - position(this, right.to) ||
        left.kind.localeCompare(right.kind),
    );
    published.fedBy.sort((left, right) => position(this, left) - position(this, right));
    const lanes = assembleLanes(this, nodes);
    retainUsed(this, nodes, lanes);
    const regions = assembleRegions(this);
    const renamed = (id: string): string => this.rename.get(id) ?? id;
    return projectPhaseGraph(
      expandMaySetLanes({
        edges: published.edges,
        lanes: lanes.map((lane) =>
          lane.families === undefined ? lane : { ...lane, families: lane.families.map(renamed) },
        ),
        regions,
        steps: assembleSteps(this, nodes, renamed),
        ...(published.fedBy.length > 0 ? { sink: { fedBy: published.fedBy } } : {}),
      }),
      this.trace.phases,
      collectPhaseClaims(
        this.trace.events,
        stepIds,
        (chain) => certainChain(this, chain),
        this.controlled,
      ),
      published.phaseFacts,
      (left, right) => shares(this, left, right),
    );
  }

  private noteJump(event: JumpEvent): void {
    const kind = event.kind;
    if (kind !== "break" && kind !== "continue") return;
    const arm = armBefore(this, event.regions, event.target);
    if (arm === undefined || !event.regions.includes(event.target)) return;
    this.regionsOf.forEach((regions, step) => {
      if (!regions.has(arm)) return;
      const loops = this.deferred.get(step) ?? new Map<string, JumpWord>();
      loops.set(event.target, kind);
      this.deferred.set(step, loops);
    });
  }

  private noteSettle(event: SettleEvent): void {
    const settledFrame = frame(this, event.regions);
    event.steps.forEach((step) => {
      const byFrame = this.settled.get(step) ?? new Map<string, boolean>();
      const prior = byFrame.get(settledFrame);
      // A later certain settle upgrades a maybe one. A certain settle stays certain.
      if (prior === undefined || (prior && !event.maybe)) byFrame.set(settledFrame, event.maybe);
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
      this.innermost.set(event.step, home(this, event.regions));
    }
    this.maxIssue.set(event.step, at);
    const seen = this.regionsOf.get(event.step) ?? new Set<string>();
    event.regions.forEach((id) => seen.add(id));
    this.regionsOf.set(event.step, seen);
    if (certainChain(this, event.regions)) this.unconditional.add(event.step);
    const visible = visibleFrames(this, event.regions);
    this.settled.forEach((byFrame, from) => {
      if (from === event.step) return;
      const mayHaveSettled = meetMaybe(byFrame, visible);
      if (mayHaveSettled === undefined) return;
      const route = continuation(this, from, event.regions);
      if (route === "drop") return;
      this.facts.push({
        certainty: mayHaveSettled ? "maybe" : "always",
        from,
        kind: "seq",
        to: event.step,
        toPhases: new Set([event.phase]),
        ...(route === "jump" ? { viaJump: true as const } : {}),
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
      this.facts.push({
        certainty: "always",
        exact: edge.exact,
        from: edge.from,
        kind: "data",
        to: edge.to,
      });
    });
  }

  private addFifo(issueOrder: readonly Placed[]): void {
    issueOrder.forEach((earlier, left) => {
      issueOrder.slice(left + 1).forEach((later) => {
        const lanesA = realLanes(this, earlier.id);
        const lanesB = realLanes(this, later.id);
        if (!lanesA.some((lane) => lanesB.includes(lane))) return;
        const certainty: Certainty =
          lanesA.length === 1 && lanesB.length === 1 ? "always" : "maybe";
        this.facts.push({ certainty, from: earlier.id, kind: "fifo", to: later.id });
      });
    });
  }

  private closeIterations(issueOrder: readonly Placed[]): void {
    this.trace.regions.forEach((region) => {
      if (region.kind !== "loop" && region.kind !== "fanout") return;
      const inside = issueOrder.filter(
        (node) => this.regionsOf.get(node.id)?.has(region.id) ?? false,
      );
      const first = inside[0];
      if (first === undefined) return;
      const settledHere = inside.filter(
        (node) => this.settledInside.get(region.id)?.has(node.id) ?? false,
      );
      const last = settledHere.at(-1);
      if (last !== undefined)
        this.facts.push({
          certainty: certaintyOf(this, last.id),
          from: last.id,
          kind: "seq",
          to: first.id,
        });
      settledHere.forEach((node) => markRepeat(this, node.id, "serial"));
      const awaited = new Set(settledHere.map((node) => node.id));
      inside.forEach((node) => {
        if (awaited.has(node.id)) return;
        const lanes = realLanes(this, node.id);
        const only = lanes[0];
        if (lanes.length === 1 && only !== undefined && familiesOf(this, only).length === 0) {
          this.facts.push({
            certainty: certaintyOf(this, node.id),
            from: node.id,
            kind: "fifo",
            to: node.id,
          });
          markRepeat(this, node.id, "serial");
          return;
        }
        markRepeat(this, node.id, "stack");
      });
    });
  }

  private retype(facts: readonly Fact[]): Fact[] {
    const typed: Fact[] = [];
    facts.forEach((fact) => {
      const back =
        fact.viaJump === true ||
        fact.from === fact.to ||
        lastIssue(this, fact.to) <= position(this, fact.from);
      if (!back) {
        typed.push(fact);
        return;
      }
      const self = fact.from === fact.to;
      const repeated = self
        ? iterationRegions(this, fact.to).length > 0 ||
          lastIssue(this, fact.to) > position(this, fact.to)
        : shares(this, fact.from, fact.to);
      if (!repeated) return;
      const kind = fact.kind;
      typed.push({
        certainty: fact.certainty,
        from: fact.from,
        kind: "carry",
        to: fact.to,
        ...(fact.toPhases === undefined ? {} : { toPhases: fact.toPhases }),
        ...(fact.viaJump === true ? { viaJump: true as const } : {}),
        ...(kind === "carry"
          ? fact.carryOf === undefined
            ? {}
            : { carryOf: fact.carryOf }
          : { carryOf: kind }),
      });
    });
    return typed;
  }
}

export function projectCausalityGraph(core: AnalysisCore, site: SiteGraph): CausalityGraph {
  return new CausalityPass(core, site).project();
}
