// SPDX-License-Identifier: Apache-2.0

import type { CausalityFold } from "./regions.js";
import { isStructuralRegionKind, type RegionKind } from "../constants.js";
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
import type { SiteLoc, SiteNode } from "../types.js";

// Publish the folded facts as order edges, lanes, regions, and steps.

export type Placed = SiteNode & { loc: SiteLoc };

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
    const certainty = weakest([
      fact.certainty,
      certaintyOf(host, fact.from),
      certaintyOf(host, fact.to),
    ]);
    if (fact.to === SINK_ID) {
      fedBy.push(fact.from);
      return;
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
  });
  return { edges, fedBy, phaseFacts };
}

export function assembleLanes(host: CausalityFold, nodes: readonly Placed[]): Lane[] {
  const used = new Set<string>();
  nodes.forEach((node) => (host.laneSet.get(node.id) ?? []).forEach((lane) => used.add(lane)));
  const lanes: Lane[] = [];
  if (used.has(WORKSPACE_LANE)) lanes.push({ id: WORKSPACE_LANE });
  host.site.actors.forEach((actor) => {
    if (!used.has(actor.id)) return;
    const families = familiesOf(host, actor.id);
    lanes.push({
      id: actor.id,
      loc: actor.loc,
      ...(actor.name === undefined ? {} : { name: actor.name }),
      ...(actor.namePattern === undefined ? {} : { namePattern: actor.namePattern }),
      ...(families.length > 0 ? { families } : {}),
    });
  });
  if (used.has(UNKNOWN_LANE)) lanes.push({ id: UNKNOWN_LANE });
  return lanes;
}

export function assembleRegions(host: CausalityFold): Region[] {
  const counters = new Map<RegionKind, number>();
  const regions: Region[] = [];
  host.trace.regions.forEach((region) => {
    if (!host.keep.has(region.id) || isStructuralRegionKind(region.kind)) return;
    const next = (counters.get(region.kind) ?? 0) + 1;
    counters.set(region.kind, next);
    const id = `${region.kind}#${String(next)}`;
    host.rename.set(region.id, id);
    const visible = structuralParent(host, region);
    const parent = visible === undefined ? undefined : host.rename.get(visible);
    regions.push({
      id,
      kind: region.kind,
      ...(parent === undefined ? {} : { parent }),
      ...(region.loc === undefined ? {} : { loc: region.loc }),
      ...(region.bound === undefined ? {} : { bound: region.bound }),
      ...(region.label === undefined ? {} : { label: region.label }),
    });
  });
  return regions;
}

export function assembleSteps(
  host: CausalityFold,
  nodes: readonly Placed[],
  renamed: (id: string) => string,
): Step[] {
  return nodes.map((node) => {
    const lanesForNode = host.laneSet.get(node.id) ?? [UNKNOWN_LANE];
    const repeats = host.repeat.get(node.id);
    return {
      certainty: certaintyOf(host, node.id),
      id: node.id,
      kind: node.kind as StepKind,
      label: node.label,
      ...(node.labelPattern === undefined ? {} : { labelPattern: node.labelPattern }),
      lane: lanesForNode[0] ?? UNKNOWN_LANE,
      loc: node.loc,
      region: renamed(host.innermost.get(node.id) ?? host.trace.root),
      ...(lanesForNode.length > 1 ? { lanes: lanesForNode } : {}),
      ...(repeats === undefined ? {} : { repeat: repeats }),
    };
  });
}

export function retainUsed(
  host: CausalityFold,
  nodes: readonly Placed[],
  lanes: readonly Lane[],
): void {
  const retain = (start: string | undefined): void => {
    let current = start;
    while (current !== undefined && !host.keep.has(current)) {
      host.keep.add(current);
      current = host.regionById.get(current)?.parent;
    }
  };
  nodes.forEach((node) => retain(host.innermost.get(node.id) ?? host.trace.root));
  lanes.forEach((lane) => (lane.families ?? []).forEach((family) => retain(family)));
}
