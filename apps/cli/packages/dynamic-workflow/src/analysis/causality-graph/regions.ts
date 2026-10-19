// SPDX-License-Identifier: Apache-2.0

import type { OrderRegion } from "../causality-order.js";
import { isStructuralRegionKind, type TraceRegionKind } from "../constants.js";
import type { AnalysisCore } from "../core.js";
import { SINK_ID, UNKNOWN_LANE, WORKSPACE_LANE, type Certainty } from "../causality-graph-types.js";
import type { SiteGraph, SiteNode } from "../types.js";

// Where a step sits in the region tree: home region, strand frame, lane, and
// whether two steps share a loop or fan-out. The fold owns the maps; these
// queries only read them.

export interface CausalityFold {
  readonly trace: AnalysisCore["trace"];
  readonly site: SiteGraph;
  readonly regionById: Map<string, OrderRegion>;
  readonly minIssue: Map<string, number>;
  readonly maxIssue: Map<string, number>;
  readonly innermost: Map<string, string>;
  readonly regionsOf: Map<string, Set<string>>;
  readonly unconditional: Set<string>;
  readonly actorRegions: Map<string, readonly string[]>;
  readonly deferred: Map<string, Map<string, "break" | "continue">>;
  readonly controlled: Set<string>;
  readonly laneSet: Map<string, string[]>;
  readonly repeat: Map<string, "stack" | "serial">;
  readonly keep: Set<string>;
  readonly rename: Map<string, string>;
}

export function certainChain(host: CausalityFold, chain: readonly string[]): boolean {
  return chain.every((id) => {
    const region = host.regionById.get(id);
    if (region === undefined) return false;
    const kind = region.kind;
    return (
      isStructuralRegionKind(kind) ||
      kind === "seq" ||
      kind === "parallel" ||
      (kind === "loop" && region.entered)
    );
  });
}

export function home(host: CausalityFold, chain: readonly string[]): string {
  for (const id of [...chain].reverse()) {
    const kind = kindOf(host, id);
    if (kind !== undefined && !isStructuralRegionKind(kind)) return id;
  }
  return host.trace.root;
}

export function frame(host: CausalityFold, regions: readonly string[]): string {
  for (const id of [...regions].reverse()) if (host.regionById.get(id)?.strand === true) return id;
  return host.trace.root;
}

export function visibleFrames(host: CausalityFold, regions: readonly string[]): Set<string> {
  const visible = new Set<string>([host.trace.root]);
  regions.forEach((id) => {
    if (host.regionById.get(id)?.strand === true) visible.add(id);
  });
  return visible;
}

export function armBefore(
  host: CausalityFold,
  regions: readonly string[],
  target: string,
): string | undefined {
  let arm: string | undefined;
  for (const id of [...regions].reverse()) {
    if (id === target) break;
    if (kindOf(host, id) === "branch") arm = id;
  }
  return arm;
}

export function structuralParent(host: CausalityFold, region: OrderRegion): string | undefined {
  let cursor = region.parent === undefined ? undefined : host.regionById.get(region.parent);
  while (cursor !== undefined && isStructuralRegionKind(cursor.kind)) {
    cursor = cursor.parent === undefined ? undefined : host.regionById.get(cursor.parent);
  }
  return cursor?.id;
}

export function meetMaybe(
  byFrame: ReadonlyMap<string, boolean>,
  visible: ReadonlySet<string>,
): boolean | undefined {
  let meet: boolean | undefined;
  byFrame.forEach((maybe, frame) => {
    if (visible.has(frame)) meet = meet === undefined ? maybe : meet && maybe;
  });
  return meet;
}

export function continuation(
  host: CausalityFold,
  from: string,
  regions: readonly string[],
): "drop" | "jump" | "flow" {
  const loops = host.deferred.get(from);
  if (loops === undefined) return "flow";
  let blocked = false;
  let jumped = false;
  loops.forEach((kind, loop) => {
    if (!regions.includes(loop)) return;
    if (kind === "break") blocked = true;
    else jumped = true;
  });
  if (blocked) return "drop";
  return jumped ? "jump" : "flow";
}

function kindOf(host: CausalityFold, id: string): TraceRegionKind | undefined {
  return host.regionById.get(id)?.kind;
}

export function lanesFor(node: SiteNode): string[] {
  if (node.kind === "world-read") return [WORKSPACE_LANE];
  const actors = node.actors ?? [];
  return actors.length > 0 ? actors.slice() : [UNKNOWN_LANE];
}

export function familiesOf(host: CausalityFold, actorId: string): string[] {
  return iterationLike(host, host.actorRegions.get(actorId) ?? []);
}

export function realLanes(host: CausalityFold, step: string): string[] {
  return (host.laneSet.get(step) ?? []).filter(
    (lane) => lane !== WORKSPACE_LANE && lane !== UNKNOWN_LANE,
  );
}

export function markRepeat(host: CausalityFold, step: string, mode: "stack" | "serial"): void {
  if (mode === "serial" || !host.repeat.has(step)) host.repeat.set(step, mode);
}

export function certaintyOf(host: CausalityFold, step: string): Certainty {
  return host.unconditional.has(step) && !host.controlled.has(step) ? "always" : "maybe";
}

export function position(host: CausalityFold, id: string): number {
  return id === SINK_ID ? Number.MAX_SAFE_INTEGER : (host.minIssue.get(id) ?? 0);
}

export function lastIssue(host: CausalityFold, id: string): number {
  return id === SINK_ID ? Number.MAX_SAFE_INTEGER : (host.maxIssue.get(id) ?? 0);
}

export function iterationRegions(host: CausalityFold, id: string): string[] {
  return iterationLike(host, host.regionsOf.get(id) ?? []);
}

function iterationLike(host: CausalityFold, ids: Iterable<string>): string[] {
  return [...ids].filter((id) => {
    const kind = kindOf(host, id);
    return kind === "loop" || kind === "fanout";
  });
}

export function shares(host: CausalityFold, left: string, right: string): boolean {
  const enclosing = new Set(iterationRegions(host, right));
  return iterationRegions(host, left).some((region) => enclosing.has(region));
}
