// SPDX-License-Identifier: Apache-2.0

import type { AnalysisCore, CoreSimpleSite, CoreTypes } from "./core.js";
import { isActorSite } from "./core.js";
import type { TaintOcc } from "./domain.js";
import type { ActorSite, SiteEdge, SiteGraph, SiteNode } from "./types.js";

const ENTRY_NODE: SiteNode = { id: "source", kind: "source", label: "source" };
const EXIT_NODE: SiteNode = { id: "sink", kind: "sink", label: "sink" };

interface RankedSite extends SiteNode {
  seq: number;
}

interface MutableEdge {
  exact: boolean;
  from: string;
  kind: "data" | "context";
  to: string;
  port?: number;
  type?: string;
}

function withWithin(within: string | undefined): { within: string } | Record<string, never> {
  return within === undefined ? {} : { within };
}

function withArtifact(
  artifactType: string | undefined,
): { artifactType: string } | Record<string, never> {
  return artifactType === undefined ? {} : { artifactType };
}

function plainOrdered(
  record: CoreSimpleSite,
  role: "world-read" | "join",
  catalog: CoreTypes,
): RankedSite {
  return {
    id: record.id,
    kind: role,
    label: record.label,
    loc: record.loc,
    seq: record.order,
    ...withWithin(record.within),
    ...withArtifact(catalog.siteType.get(record.id)),
  };
}

function orderedActors(
  occs: readonly TaintOcc[],
  actorOrder: ReadonlyMap<string, number>,
): string[] {
  const seen: string[] = [];
  for (const occ of occs) {
    if (!seen.includes(occ.site)) seen.push(occ.site);
  }
  seen.sort((left, right) => (actorOrder.get(left) ?? 0) - (actorOrder.get(right) ?? 0));
  return seen;
}

function askOrdered(
  record: AnalysisCore["sites"]["asks"][number],
  people: readonly string[],
  catalog: CoreTypes,
): RankedSite {
  return {
    id: record.id,
    kind: "ask",
    label: record.label,
    ...(record.labelPattern === undefined ? {} : { labelPattern: record.labelPattern }),
    loc: record.loc,
    seq: record.order,
    ...(people.length > 0 ? { actors: [...people] } : {}),
    ...withWithin(record.within),
    ...withArtifact(catalog.siteType.get(record.id)),
  };
}

function producerType(
  catalog: CoreTypes,
  producer: string,
  witness: TaintOcc,
  joining: boolean,
): string | undefined {
  const baseType = catalog.siteType.get(producer);
  if (joining || witness.port === undefined) return baseType;
  const portTypes = catalog.joinPortTypes.get(producer);
  if (portTypes === undefined) return baseType;
  return portTypes[witness.port] ?? baseType;
}

function dataEdge(
  catalog: CoreTypes,
  producer: string,
  consumer: string,
  witness: TaintOcc,
  joining: boolean,
): MutableEdge {
  const artifact = producerType(catalog, producer, witness, joining);
  const link: MutableEdge = {
    exact: witness.exact,
    from: producer,
    kind: "data",
    to: consumer,
  };
  if (witness.port !== undefined) link.port = witness.port;
  if (artifact !== undefined) link.type = artifact;
  return link;
}

function pushGroups(
  links: MutableEdge[],
  catalog: CoreTypes,
  groups: Iterable<[string, TaintOcc[]]>,
  joining: boolean,
): void {
  for (const [target, occs] of groups) {
    let index = 0;
    while (index < occs.length) {
      const witness = occs[index];
      index += 1;
      if (witness === undefined) continue;
      links.push(dataEdge(catalog, witness.site, target, witness, joining));
    }
  }
}

function actorsIntersect(left: readonly TaintOcc[], right: readonly TaintOcc[]): boolean {
  const sites = new Set<string>();
  for (const occ of left) sites.add(occ.site);
  for (const occ of right) {
    if (sites.has(occ.site)) return true;
  }
  return false;
}

function contextExact(left: readonly TaintOcc[], right: readonly TaintOcc[]): boolean {
  if (left.length !== 1 || right.length !== 1) return false;
  const first = left[0];
  const second = right[0];
  if (first === undefined || second === undefined) return false;
  return first.site === second.site && first.exact && second.exact;
}

function pushContext(core: AnalysisCore, links: MutableEdge[]): void {
  const askOrder = new Map(core.sites.asks.map((site) => [site.id, site.order]));
  const rows: { actors: TaintOcc[]; id: string }[] = [];
  for (const site of core.sites.asks) {
    const actors = core.facts.askActor.get(site.id) ?? [];
    if (actors.length === 0) continue;
    rows.push({ actors, id: site.id });
  }
  let left = 0;
  while (left < rows.length) {
    const earlier = rows[left];
    left += 1;
    if (earlier === undefined) continue;
    let right = left;
    while (right < rows.length) {
      const later = rows[right];
      right += 1;
      if (later === undefined || !actorsIntersect(earlier.actors, later.actors)) continue;
      const earlierAt = askOrder.get(earlier.id) ?? 0;
      const laterAt = askOrder.get(later.id) ?? 0;
      const forward = earlierAt <= laterAt;
      links.push({
        exact: contextExact(earlier.actors, later.actors),
        from: forward ? earlier.id : later.id,
        kind: "context",
        to: forward ? later.id : earlier.id,
      });
    }
  }
}

function dedupeEdges(links: readonly MutableEdge[]): MutableEdge[] {
  const kept = new Map<string, MutableEdge>();
  for (const link of links) {
    if (isActorSite(link.from) && link.kind === "data") continue;
    const port = link.port === undefined ? "" : String(link.port);
    const signature = `${link.from}|${link.to}|${link.kind}|${port}`;
    const prior = kept.get(signature);
    if (prior === undefined) {
      kept.set(signature, { ...link });
      continue;
    }
    if (link.exact && !prior.exact) prior.exact = true;
    if (prior.type === undefined && link.type !== undefined) prior.type = link.type;
  }
  return [...kept.values()];
}

function sealSources(nodes: readonly RankedSite[], links: MutableEdge[]): void {
  const incoming = new Set<string>();
  for (const link of links) {
    if (link.kind === "data") incoming.add(link.to);
  }
  for (const node of nodes) {
    if (node.kind === "join" || incoming.has(node.id)) continue;
    links.push({ exact: true, from: "source", kind: "data", to: node.id });
  }
}

function dropBareRelays(nodes: readonly RankedSite[], links: readonly MutableEdge[]): RankedSite[] {
  const touched = new Set<string>();
  for (const link of links) {
    touched.add(link.from);
    touched.add(link.to);
  }
  return nodes.filter((node) => {
    if (node.kind !== "join" && node.kind !== "fan-out") return true;
    return touched.has(node.id);
  });
}

function withoutOrder(node: RankedSite): SiteNode {
  const { seq: _seq, ...rest } = node;
  return rest;
}

function publishActors(core: AnalysisCore): ActorSite[] {
  return core.sites.actors.map((person) => ({
    id: person.id,
    loc: person.loc,
    ...(person.name === undefined ? {} : { name: person.name }),
    ...(person.namePattern === undefined ? {} : { namePattern: person.namePattern }),
    ...withWithin(person.within),
  }));
}

export function projectSiteGraph(analysis: AnalysisCore): SiteGraph {
  const { facts, sites, types } = analysis;
  const actorRank = new Map(sites.actors.map((person) => [person.id, person.order]));
  const ordered: RankedSite[] = [];
  for (const site of sites.asks) {
    ordered.push(askOrdered(site, orderedActors(facts.askActor.get(site.id) ?? [], actorRank), types));
  }
  for (const site of sites.worldReads) ordered.push(plainOrdered(site, "world-read", types));
  for (const site of sites.joins) ordered.push(plainOrdered(site, "join", types));
  for (const record of sites.fanouts) {
    ordered.push({
      id: record.id,
      kind: "fan-out",
      label: record.label,
      loc: record.loc,
      seq: record.order,
      ...withWithin(record.within),
      ...withArtifact(types.siteType.get(record.id)),
    });
  }
  ordered.sort((left, right) => left.seq - right.seq);

  const links: MutableEdge[] = [];
  pushGroups(links, types, facts.askData, false);
  pushGroups(links, types, facts.worldReadData, false);
  pushGroups(links, types, facts.joinIn, true);
  pushGroups(links, types, facts.fanoutIn, false);
  for (const witness of facts.returnData) {
    links.push(dataEdge(types, witness.site, "sink", witness, false));
  }
  pushContext(analysis, links);

  const unique = dedupeEdges(links);
  sealSources(ordered, unique);
  const kept = dropBareRelays(ordered, unique);
  return {
    actors: publishActors(analysis),
    edges: unique,
    nodes: [ENTRY_NODE, ...kept.map(withoutOrder), EXIT_NODE],
  };
}
