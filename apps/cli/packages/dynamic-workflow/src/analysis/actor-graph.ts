// SPDX-License-Identifier: Apache-2.0

import type { SiteGraph, SiteLoc, SiteNode } from "./types.js";

// Actor lanes are the nodes. A message edge exists only when at least one end is an actor.
export interface ActorNode {
  readonly id: string;
  readonly name?: string;
  readonly loc?: SiteLoc;
  readonly family?: string;
}

export interface ActorEdge {
  readonly from: string;
  readonly to: string;
  readonly exact: boolean;
  readonly count: number;
  readonly types?: readonly string[];
}

export interface ActorGraph {
  readonly nodes: readonly ActorNode[];
  readonly edges: readonly ActorEdge[];
}

const LANE_ID = {
  source: "source",
  sink: "sink",
  workspace: "workspace",
} as const;

const TERMINALS: ReadonlySet<string> = new Set([LANE_ID.source, LANE_ID.sink, LANE_ID.workspace]);

function lanesFor(
  id: string,
  kinds: ReadonlyMap<string, SiteNode["kind"]>,
  askActors: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  if (id === LANE_ID.source || id === LANE_ID.sink) return [id];
  const kind = kinds.get(id);
  if (kind === "world-read") return [LANE_ID.workspace];
  if (kind === "ask") return [...(askActors.get(id) ?? [])];
  return new Array<string>(0);
}

function isTerminal(id: string): boolean {
  return TERMINALS.has(id);
}

function attachType(edge: ActorEdge, type: string | undefined): ActorEdge {
  if (type === undefined) return edge;
  const prior = edge.types;
  if (prior === undefined) return { ...edge, types: [type] };
  if (prior.includes(type)) return edge;
  return { ...edge, types: prior.concat(type) };
}

function pairKey(from: string, to: string): string {
  return from + "|" + to;
}

function contribute(
  buckets: Map<string, ActorEdge>,
  from: string,
  to: string,
  exact: boolean,
  type: string | undefined,
): void {
  const key = pairKey(from, to);
  const prior = buckets.get(key);
  if (prior === undefined) {
    buckets.set(key, attachType({ count: 1, exact, from, to }, type));
    return;
  }
  buckets.set(key, attachType({ ...prior, count: prior.count + 1, exact: prior.exact || exact }, type));
}

function actorNode(actor: SiteGraph["actors"][number]): ActorNode {
  const name = actor.name;
  const family = actor.within;
  return {
    id: actor.id,
    loc: actor.loc,
    ...(name === undefined ? {} : { name }),
    ...(family === undefined ? {} : { family }),
  };
}

export function toActorGraph(sites: SiteGraph): ActorGraph {
  const kinds = new Map<string, SiteNode["kind"]>();
  const askActors = new Map<string, readonly string[]>();
  for (const node of sites.nodes) {
    kinds.set(node.id, node.kind);
    if (node.kind === "ask") askActors.set(node.id, node.actors ?? []);
  }

  const buckets = new Map<string, ActorEdge>();
  for (const link of sites.edges) {
    if (link.kind !== "data") continue;
    if (link.from === LANE_ID.source && kinds.get(link.to) === "world-read") continue;
    const origins = lanesFor(link.from, kinds, askActors);
    const destinations = lanesFor(link.to, kinds, askActors);
    if (origins.length === 0 || destinations.length === 0) continue;
    const exact = link.exact && origins.length === 1 && destinations.length === 1;
    for (const from of origins) {
      for (const to of destinations) contribute(buckets, from, to, exact, link.type);
    }
  }

  const kept: ActorEdge[] = [];
  for (const edge of buckets.values()) {
    if (isTerminal(edge.from) && isTerminal(edge.to)) continue;
    kept.push(edge);
  }

  const touched = new Set<string>();
  for (const edge of kept) {
    touched.add(edge.from);
    touched.add(edge.to);
  }

  const roster: ActorNode[] = [];
  if (touched.has(LANE_ID.source)) roster.push({ id: LANE_ID.source });
  if (touched.has(LANE_ID.workspace)) roster.push({ id: LANE_ID.workspace });
  for (const actor of sites.actors) roster.push(actorNode(actor));
  if (touched.has(LANE_ID.sink)) roster.push({ id: LANE_ID.sink });

  const position = new Map<string, number>();
  let index = 0;
  while (index < roster.length) {
    const node = roster[index];
    if (node !== undefined) position.set(node.id, index);
    index += 1;
  }
  const rank = (id: string): number => position.get(id) ?? Number.MAX_SAFE_INTEGER;
  kept.sort((left, right) => rank(left.from) - rank(right.from) || rank(left.to) - rank(right.to));
  return { edges: kept, nodes: roster };
}
