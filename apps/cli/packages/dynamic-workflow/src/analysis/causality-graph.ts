// SPDX-License-Identifier: Apache-2.0

import type { OrderRegion } from "./causality-order.js";
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
import { isStructuralRegionKind, type RegionKind } from "./constants.js";
import type { AnalysisCore } from "./core.js";
import { collectPhaseClaims, projectPhaseGraph, type PhaseSourceFact } from "./phase-graph.js";
import type { SiteGraph, SiteLoc, SiteNode } from "./types.js";

export type { NamePattern } from "./types.js";
export { SINK_ID, UNKNOWN_LANE, WORKSPACE_LANE } from "./causality-graph-types.js";
export type { CausalityGraph, Certainty, Lane, OrderEdge } from "./causality-graph-types.js";
export type { Phase, Region, Step, StepKind } from "./causality-graph-types.js";
export type { OrderKind, RegionKind };

type Located = SiteNode & { loc: SiteLoc };
type JumpWord = "continue" | "break";

function chainCertain(regionById: Map<string, OrderRegion>, chain: readonly string[]): boolean {
  for (const id of chain) {
    const region = regionById.get(id);
    if (region === undefined) return false;
    const kind = region.kind;
    if (isStructuralRegionKind(kind) || kind === "seq" || kind === "parallel") continue;
    if (kind === "loop" && region.entered) continue;
    return false;
  }
  return true;
}

function homeOf(
  regionById: Map<string, OrderRegion>,
  chain: readonly string[],
  root: string,
): string {
  for (const id of [...chain].reverse()) {
    const kind = regionById.get(id)?.kind;
    if (kind !== undefined && !isStructuralRegionKind(kind)) return id;
  }
  return root;
}

function frameOf(
  regionById: Map<string, OrderRegion>,
  regions: readonly string[],
  root: string,
): string {
  for (const id of [...regions].reverse()) {
    if (regionById.get(id)?.strand === true) return id;
  }
  return root;
}

function visibleFrames(
  regionById: Map<string, OrderRegion>,
  regions: readonly string[],
  root: string,
): Set<string> {
  const visible = new Set<string>([root]);
  for (const id of regions) if (regionById.get(id)?.strand === true) visible.add(id);
  return visible;
}

function parentPastStructure(
  region: OrderRegion,
  regionById: Map<string, OrderRegion>,
): string | undefined {
  let parent = region.parent === undefined ? undefined : regionById.get(region.parent);
  while (parent !== undefined && isStructuralRegionKind(parent.kind)) {
    parent = parent.parent === undefined ? undefined : regionById.get(parent.parent);
  }
  return parent?.id;
}

function readTrace(trace: AnalysisCore["trace"], regionById: Map<string, OrderRegion>) {
  const facts: Fact[] = [];
  const minIssue = new Map<string, number>();
  const maxIssue = new Map<string, number>();
  const innermostRegion = new Map<string, string>();
  const regionsOf = new Map<string, Set<string>>();
  const unconditional = new Set<string>();
  const actorRegions = new Map<string, readonly string[]>();
  const settled = new Map<string, Map<string, boolean>>();
  const settledInside = new Map<string, Set<string>>();
  const deferredByStep = new Map<string, Map<string, JumpWord>>();
  let clock = 0;
  for (const event of trace.events) {
    switch (event.at) {
      case "mark":
        break;
      case "jump": {
        if (event.kind !== "continue" && event.kind !== "break") break;
        let arm: string | undefined;
        for (const id of [...event.regions].reverse()) {
          if (id === event.target) break;
          if (regionById.get(id)?.kind === "branch") arm = id;
        }
        if (arm === undefined || !event.regions.includes(event.target)) break;
        for (const [step, regions] of regionsOf) {
          if (!regions.has(arm)) continue;
          const loops = deferredByStep.get(step) ?? new Map<string, JumpWord>();
          loops.set(event.target, event.kind);
          deferredByStep.set(step, loops);
        }
        break;
      }
      case "settle": {
        const frame = frameOf(regionById, event.regions, trace.root);
        for (const step of event.steps) {
          const byFrame = settled.get(step) ?? new Map<string, boolean>();
          const prior = byFrame.get(frame);
          if (prior === undefined || (prior && !event.maybe)) byFrame.set(frame, event.maybe);
          settled.set(step, byFrame);
        }
        for (const id of event.regions) {
          const held = settledInside.get(id) ?? new Set<string>();
          for (const step of event.steps) held.add(step);
          settledInside.set(id, held);
        }
        break;
      }
      case "actor":
        if (!actorRegions.has(event.actor)) actorRegions.set(event.actor, event.regions);
        break;
      case "issue": {
        const at = clock;
        clock += 1;
        if (!minIssue.has(event.step)) {
          minIssue.set(event.step, at);
          innermostRegion.set(event.step, homeOf(regionById, event.regions, trace.root));
        }
        maxIssue.set(event.step, at);
        const seen = regionsOf.get(event.step) ?? new Set<string>();
        for (const id of event.regions) seen.add(id);
        regionsOf.set(event.step, seen);
        if (chainCertain(regionById, event.regions)) unconditional.add(event.step);
        const visible = visibleFrames(regionById, event.regions, trace.root);
        for (const [from, byFrame] of settled) {
          if (from === event.step) continue;
          let mayHaveSettled: boolean | undefined;
          for (const [frame, maybe] of byFrame) {
            if (!visible.has(frame)) continue;
            mayHaveSettled = mayHaveSettled === undefined ? maybe : mayHaveSettled && maybe;
          }
          if (mayHaveSettled === undefined) continue;
          let viaJump = false;
          let unrealizable = false;
          for (const [loop, kind] of deferredByStep.get(from) ?? []) {
            if (!event.regions.includes(loop)) continue;
            if (kind === "break") unrealizable = true;
            else viaJump = true;
          }
          if (unrealizable) continue;
          facts.push({
            certainty: mayHaveSettled ? "maybe" : "always",
            from,
            kind: "seq",
            to: event.step,
            toPhases: new Set([event.phase]),
            ...(viaJump ? { viaJump: true as const } : {}),
          });
        }
        break;
      }
      default:
        break;
    }
  }
  return {
    actorRegions,
    facts,
    innermostRegion,
    maxIssue,
    minIssue,
    regionsOf,
    settledInside,
    unconditional,
  };
}

function locatedSteps(site: SiteGraph): Located[] {
  const selected: Located[] = [];
  for (const node of site.nodes) {
    if (node.loc === undefined || (node.kind !== "ask" && node.kind !== "world-read")) continue;
    selected.push(node as Located);
  }
  return selected;
}

export function projectCausalityGraph(core: AnalysisCore, site: SiteGraph): CausalityGraph {
  const trace = core.trace;
  const regionById = new Map(trace.regions.map((region) => [region.id, region]));
  const nodes = locatedSteps(site);
  const stepIds = new Set(nodes.map((node) => node.id));
  const traced = readTrace(trace, regionById);
  const {
    facts,
    regionsOf,
    unconditional,
    actorRegions,
    settledInside,
    minIssue,
    maxIssue,
    innermostRegion,
  } = traced;

  const laneSet = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.kind === "world-read") laneSet.set(node.id, [WORKSPACE_LANE]);
    else {
      const actors = node.actors ?? [];
      laneSet.set(node.id, actors.length > 0 ? [...actors] : [UNKNOWN_LANE]);
    }
  }
  const familiesOf = (actorId: string): string[] =>
    (actorRegions.get(actorId) ?? []).filter((id) => {
      const kind = regionById.get(id)?.kind;
      return kind === "fanout" || kind === "loop";
    });
  const realLanes = (step: string): string[] =>
    (laneSet.get(step) ?? []).filter((lane) => lane !== WORKSPACE_LANE && lane !== UNKNOWN_LANE);

  const controlled = new Set<string>();
  for (const control of trace.controls) {
    for (const step of nodes) {
      if (!(regionsOf.get(step.id)?.has(control.region) ?? false)) continue;
      controlled.add(step.id);
      for (const controller of control.controllers) {
        if (controller === step.id || !stepIds.has(controller)) continue;
        facts.push({ certainty: "always", from: controller, kind: "control", to: step.id });
      }
      for (const controller of control.maybeControllers) {
        if (controller === step.id || !stepIds.has(controller)) continue;
        facts.push({ certainty: "maybe", from: controller, kind: "control", to: step.id });
      }
    }
  }
  const certaintyOf = (step: string): Certainty =>
    unconditional.has(step) && !controlled.has(step) ? "always" : "maybe";

  for (const edge of site.edges) {
    if (edge.kind !== "data" || !stepIds.has(edge.from)) continue;
    if (edge.to !== SINK_ID && !stepIds.has(edge.to)) continue;
    facts.push({
      certainty: "always",
      exact: edge.exact,
      from: edge.from,
      kind: "data",
      to: edge.to,
    });
  }

  const issueOrder = [...nodes].sort(
    (left, right) => (minIssue.get(left.id) ?? 0) - (minIssue.get(right.id) ?? 0),
  );
  for (let left = 0; left < issueOrder.length; left += 1) {
    for (let right = left + 1; right < issueOrder.length; right += 1) {
      const earlier = issueOrder[left];
      const later = issueOrder[right];
      if (earlier === undefined || later === undefined) continue;
      const lanesA = realLanes(earlier.id);
      const lanesB = realLanes(later.id);
      if (lanesA.every((lane) => !lanesB.includes(lane))) continue;
      const certainty: Certainty = lanesA.length === 1 && lanesB.length === 1 ? "always" : "maybe";
      facts.push({ certainty, from: earlier.id, kind: "fifo", to: later.id });
    }
  }

  const repeat = new Map<string, "stack" | "serial">();
  const markRepeat = (step: string, value: "stack" | "serial"): void => {
    if (value === "serial" || !repeat.has(step)) repeat.set(step, value);
  };
  for (const region of trace.regions) {
    if (region.kind !== "loop" && region.kind !== "fanout") continue;
    const inside = issueOrder.filter((node) => regionsOf.get(node.id)?.has(region.id) ?? false);
    const first = inside[0];
    if (first === undefined) continue;
    const settledHere = inside.filter(
      (node) => settledInside.get(region.id)?.has(node.id) ?? false,
    );
    const last = settledHere[settledHere.length - 1];
    if (last !== undefined)
      facts.push({ certainty: certaintyOf(last.id), from: last.id, kind: "seq", to: first.id });
    for (const node of settledHere) markRepeat(node.id, "serial");
    const awaited = new Set(settledHere.map((node) => node.id));
    for (const node of inside) {
      if (awaited.has(node.id)) continue;
      const lanes = realLanes(node.id);
      const only = lanes[0];
      const fixed = lanes.length === 1 && only !== undefined && familiesOf(only).length === 0;
      if (!fixed) {
        markRepeat(node.id, "stack");
        continue;
      }
      facts.push({ certainty: certaintyOf(node.id), from: node.id, kind: "fifo", to: node.id });
      markRepeat(node.id, "serial");
    }
  }

  const positionOf = (id: string): number =>
    id === SINK_ID ? Number.MAX_SAFE_INTEGER : (minIssue.get(id) ?? 0);
  const lastIssueOf = (id: string): number =>
    id === SINK_ID ? Number.MAX_SAFE_INTEGER : (maxIssue.get(id) ?? 0);
  const iterationRegions = (id: string): string[] =>
    [...(regionsOf.get(id) ?? [])].filter((region) => {
      const kind = regionById.get(region)?.kind;
      return kind === "loop" || kind === "fanout";
    });
  const sharesIteration = (left: string, right: string): boolean => {
    const enclosing = new Set(iterationRegions(right));
    return iterationRegions(left).some((region) => enclosing.has(region));
  };
  const typed: Fact[] = [];
  for (const fact of dedupeFacts(facts)) {
    const back =
      fact.viaJump === true ||
      fact.from === fact.to ||
      lastIssueOf(fact.to) <= positionOf(fact.from);
    if (!back) {
      typed.push(fact);
      continue;
    }
    const repeated =
      fact.from === fact.to
        ? iterationRegions(fact.to).length > 0 || lastIssueOf(fact.to) > positionOf(fact.to)
        : sharesIteration(fact.from, fact.to);
    if (!repeated) continue;
    const { exact: _exact, kind, ...rest } = fact;
    typed.push({ ...rest, kind: "carry", ...(kind === "carry" ? {} : { carryOf: kind }) });
  }
  const reduced = reduceOrdering(typed);
  const edges: OrderEdge[] = [];
  const fedBy: string[] = [];
  const phaseFacts: PhaseSourceFact[] = [];
  for (const fact of reduced) {
    const certainty = weakest([fact.certainty, certaintyOf(fact.from), certaintyOf(fact.to)]);
    if (fact.to === SINK_ID) {
      fedBy.push(fact.from);
      continue;
    }
    phaseFacts.push({
      certainty,
      from: fact.from,
      kind: fact.kind,
      to: fact.to,
      ...(fact.carryOf === undefined ? {} : { carryOf: fact.carryOf }),
      ...(fact.toPhases === undefined ? {} : { toPhases: fact.toPhases }),
    });
    const published: OrderEdge = { certainty, from: fact.from, kind: fact.kind, to: fact.to };
    edges.push(
      fact.kind === "data" && fact.exact !== undefined
        ? { ...published, exact: fact.exact }
        : published,
    );
  }
  edges.sort(
    (left, right) =>
      positionOf(left.from) - positionOf(right.from) ||
      positionOf(left.to) - positionOf(right.to) ||
      left.kind.localeCompare(right.kind),
  );
  fedBy.sort((left, right) => positionOf(left) - positionOf(right));

  const usedLanes = new Set<string>();
  for (const node of nodes) for (const lane of laneSet.get(node.id) ?? []) usedLanes.add(lane);
  const laneOrder: Lane[] = [];
  if (usedLanes.has(WORKSPACE_LANE)) laneOrder.push({ id: WORKSPACE_LANE });
  for (const actor of site.actors) {
    if (!usedLanes.has(actor.id)) continue;
    const families = familiesOf(actor.id);
    laneOrder.push({
      id: actor.id,
      loc: actor.loc,
      ...(actor.name === undefined ? {} : { name: actor.name }),
      ...(actor.namePattern === undefined ? {} : { namePattern: actor.namePattern }),
      ...(families.length > 0 ? { families } : {}),
    });
  }
  if (usedLanes.has(UNKNOWN_LANE)) laneOrder.push({ id: UNKNOWN_LANE });

  const keep = new Set<string>();
  const keepFrom = (start: string | undefined): void => {
    let current = start;
    while (current !== undefined && !keep.has(current)) {
      keep.add(current);
      current = regionById.get(current)?.parent;
    }
  };
  for (const node of nodes) keepFrom(innermostRegion.get(node.id) ?? trace.root);
  for (const lane of laneOrder) for (const family of lane.families ?? []) keepFrom(family);

  const rename = new Map<string, string>();
  const counters = new Map<RegionKind, number>();
  const regions: Region[] = [];
  for (const region of trace.regions) {
    if (!keep.has(region.id) || isStructuralRegionKind(region.kind)) continue;
    const next = (counters.get(region.kind) ?? 0) + 1;
    counters.set(region.kind, next);
    const id = `${region.kind}#${next}`;
    rename.set(region.id, id);
    const visible = parentPastStructure(region, regionById);
    const parent = visible === undefined ? undefined : rename.get(visible);
    regions.push({
      id,
      kind: region.kind,
      ...(parent === undefined ? {} : { parent }),
      ...(region.loc === undefined ? {} : { loc: region.loc }),
      ...(region.bound === undefined ? {} : { bound: region.bound }),
      ...(region.label === undefined ? {} : { label: region.label }),
    });
  }
  const renamed = (id: string): string => rename.get(id) ?? id;
  const lanes = laneOrder.map((lane) =>
    lane.families === undefined ? lane : { ...lane, families: lane.families.map(renamed) },
  );
  const steps: Step[] = nodes.map((node) => {
    const lanesForNode = laneSet.get(node.id) ?? [UNKNOWN_LANE];
    const repeats = repeat.get(node.id);
    return {
      certainty: certaintyOf(node.id),
      id: node.id,
      kind: node.kind as StepKind,
      label: node.label,
      ...(node.labelPattern === undefined ? {} : { labelPattern: node.labelPattern }),
      lane: lanesForNode[0] ?? UNKNOWN_LANE,
      loc: node.loc,
      region: renamed(innermostRegion.get(node.id) ?? trace.root),
      ...(lanesForNode.length > 1 ? { lanes: lanesForNode } : {}),
      ...(repeats === undefined ? {} : { repeat: repeats }),
    };
  });
  const expanded = expandMaySetLanes({
    edges,
    lanes,
    regions,
    steps,
    ...(fedBy.length > 0 ? { sink: { fedBy } } : {}),
  });
  return projectPhaseGraph(
    expanded,
    trace.phases,
    collectPhaseClaims(
      trace.events,
      stepIds,
      (chain) => chainCertain(regionById, chain),
      controlled,
    ),
    phaseFacts,
    sharesIteration,
  );
}
