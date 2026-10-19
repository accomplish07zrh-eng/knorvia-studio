// SPDX-License-Identifier: Apache-2.0

import type { OrderRegion } from "../causality-order.js";
import { isStructuralRegionKind, type RegionKind } from "../constants.js";
import type { CausalityFold } from "./regions.js";
import { certaintyOf, familiesOf, structuralParent } from "./regions.js";
import {
  SINK_ID,
  UNKNOWN_LANE,
  WORKSPACE_LANE,
  type Fact,
  type Lane,
  type OrderEdge,
  type Region,
  type Step,
  type StepKind,
} from "../causality-graph-types.js";
import { weakest } from "../causality-graph-lanes.js";
import type { PhaseSourceFact } from "../phase-graph.js";
import type { ActorSite, SiteLoc, SiteNode } from "../types.js";

// Turn the folded trace into the pieces the projection publishes: order edges,
// phase-graph inputs, lanes, regions, and steps. Absent optional fields stay
// off the object; the serializer reads presence, not an explicit undefined.

export type Placed = SiteNode & { loc: SiteLoc };

type Writable<T> = { -readonly [K in keyof T]: T[K] };

function endpoints(fact: Fact, certainty: Fact["certainty"]) {
  const from = fact.from;
  const kind = fact.kind;
  const to = fact.to;
  return { certainty, from, kind, to };
}

function inheritedCertainty(host: CausalityFold, fact: Fact): Fact["certainty"] {
  const atFrom = certaintyOf(host, fact.from);
  const atTo = certaintyOf(host, fact.to);
  return weakest([fact.certainty, atFrom, atTo]);
}

// Phase facts keep carryOf and toPhases whenever the reduced fact still has
// them. Edges copy `exact` only for data facts; other kinds drop it.
function phaseFrom(fact: Fact, certainty: Fact["certainty"]): PhaseSourceFact {
  const record: Writable<PhaseSourceFact> = endpoints(fact, certainty);
  if (fact.carryOf !== undefined) record.carryOf = fact.carryOf;
  if (fact.toPhases !== undefined) record.toPhases = fact.toPhases;
  return record;
}

function edgeFrom(fact: Fact, certainty: Fact["certainty"]): OrderEdge {
  const record: Writable<OrderEdge> = endpoints(fact, certainty);
  if (fact.kind === "data" && fact.exact !== undefined) record.exact = fact.exact;
  return record;
}

export function publish(
  host: CausalityFold,
  reduced: readonly Fact[],
): {
  edges: OrderEdge[];
  fedBy: string[];
  phaseFacts: PhaseSourceFact[];
} {
  const edges: OrderEdge[] = [];
  const fedBy: string[] = [];
  const phaseFacts: PhaseSourceFact[] = [];
  reduced.forEach((fact) => {
    const certainty = inheritedCertainty(host, fact);
    if (fact.to === SINK_ID) {
      fedBy.push(fact.from);
      return;
    }
    phaseFacts.push(phaseFrom(fact, certainty));
    edges.push(edgeFrom(fact, certainty));
  });
  return { edges, fedBy, phaseFacts };
}

function lanesTouched(host: CausalityFold, nodes: readonly Placed[]): Set<string> {
  const used = new Set<string>();
  for (const node of nodes) {
    const membership = host.laneSet.get(node.id);
    if (membership === undefined) continue;
    for (const laneId of membership) used.add(laneId);
  }
  return used;
}

function bareLane(id: string): Lane {
  const record: Writable<Lane> = { id };
  return record;
}

function actorLane(host: CausalityFold, actor: ActorSite): Lane {
  const record: Writable<Lane> = { id: actor.id };
  record.loc = actor.loc;
  if (actor.name !== undefined) record.name = actor.name;
  if (actor.namePattern !== undefined) record.namePattern = actor.namePattern;
  const families = familiesOf(host, actor.id);
  if (families.length > 0) record.families = families;
  return record;
}

export function assembleLanes(host: CausalityFold, nodes: readonly Placed[]): Lane[] {
  const used = lanesTouched(host, nodes);
  const lanes: Lane[] = [];
  if (used.has(WORKSPACE_LANE)) lanes.push(bareLane(WORKSPACE_LANE));
  for (const actor of host.site.actors) {
    if (!used.has(actor.id)) continue;
    lanes.push(actorLane(host, actor));
  }
  if (used.has(UNKNOWN_LANE)) lanes.push(bareLane(UNKNOWN_LANE));
  return lanes;
}

// The public id is the count of regions of this kind already published, so the
// numbering stays in trace order without a side counter.
function nextKindOrdinal(regions: readonly Region[], kind: RegionKind): number {
  let seen = 0;
  for (const earlier of regions) {
    if (earlier.kind === kind) seen += 1;
  }
  return seen + 1;
}

function renamedParent(host: CausalityFold, region: OrderRegion): string | undefined {
  const visible = structuralParent(host, region);
  if (visible === undefined) return undefined;
  return host.rename.get(visible);
}

function regionFrom(
  region: OrderRegion & { kind: RegionKind },
  id: string,
  parent: string | undefined,
): Region {
  const record: Writable<Region> = { id, kind: region.kind };
  if (parent !== undefined) record.parent = parent;
  if (region.loc !== undefined) record.loc = region.loc;
  if (region.bound !== undefined) record.bound = region.bound;
  if (region.label !== undefined) record.label = region.label;
  return record;
}

function keptForExport(
  host: CausalityFold,
  region: OrderRegion,
): region is OrderRegion & { kind: RegionKind } {
  return host.keep.has(region.id) && !isStructuralRegionKind(region.kind);
}

export function assembleRegions(host: CausalityFold): Region[] {
  const regions: Region[] = [];
  for (const region of host.trace.regions) {
    if (!keptForExport(host, region)) continue;
    const ordinal = nextKindOrdinal(regions, region.kind);
    const id = `${region.kind}#${String(ordinal)}`;
    host.rename.set(region.id, id);
    regions.push(regionFrom(region, id, renamedParent(host, region)));
  }
  return regions;
}

function stepFrom(host: CausalityFold, node: Placed, renamed: (id: string) => string): Step {
  const membership = host.laneSet.get(node.id);
  const lanesForNode = membership === undefined ? [UNKNOWN_LANE] : membership;
  const home = host.innermost.get(node.id);
  const record = { certainty: certaintyOf(host, node.id) } as Writable<Step>;
  record.id = node.id;
  record.kind = node.kind as StepKind;
  record.label = node.label;
  if (node.labelPattern !== undefined) record.labelPattern = node.labelPattern;
  record.lane = lanesForNode[0] ?? UNKNOWN_LANE;
  record.loc = node.loc;
  record.region = renamed(home ?? host.trace.root);
  if (lanesForNode.length > 1) record.lanes = lanesForNode;
  const repeats = host.repeat.get(node.id);
  if (repeats !== undefined) record.repeat = repeats;
  return record;
}

export function assembleSteps(
  host: CausalityFold,
  nodes: readonly Placed[],
  renamed: (id: string) => string,
): Step[] {
  const steps: Step[] = [];
  for (const node of nodes) steps.push(stepFrom(host, node, renamed));
  return steps;
}

function climbUntilKept(host: CausalityFold, start: string | undefined): void {
  let cursor = start;
  while (cursor !== undefined) {
    if (host.keep.has(cursor)) return;
    host.keep.add(cursor);
    const owner = host.regionById.get(cursor);
    cursor = owner === undefined ? undefined : owner.parent;
  }
}

export function retainUsed(
  host: CausalityFold,
  nodes: readonly Placed[],
  lanes: readonly Lane[],
): void {
  for (const node of nodes) {
    const home = host.innermost.get(node.id);
    climbUntilKept(host, home === undefined ? host.trace.root : home);
  }
  for (const lane of lanes) {
    const families = lane.families;
    if (families === undefined) continue;
    for (const family of families) climbUntilKept(host, family);
  }
}
