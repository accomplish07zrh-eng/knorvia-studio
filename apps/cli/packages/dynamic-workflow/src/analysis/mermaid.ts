// SPDX-License-Identifier: Apache-2.0

import type { ActorEdge, ActorGraph, ActorNode } from "./actor-graph.js";
import { WORKSPACE_LANE, type CausalityGraph, type Lane, type Step } from "./causality-graph.js";
import {
  FLOW_ABORT,
  FLOW_ENTRY,
  FLOW_SINK,
  type ControlFlowGraph,
  type FlowEdge,
  type FlowNode,
} from "./flow-graph.js";
import type { Handoff, HandoffGraph, HandoffParticipant } from "./handoff-graph.js";
import type { ActorSite, SiteEdge, SiteGraph, SiteNode } from "./types.js";

function safeId(raw: string): string {
  let built = "";
  for (let cursor = 0; cursor < raw.length; cursor += 1) {
    const glyph = raw.charAt(cursor);
    const code = glyph.charCodeAt(0);
    const digit = code >= 48 && code <= 57;
    const upper = code >= 65 && code <= 90;
    const lower = code >= 97 && code <= 122;
    built += digit || upper || lower || glyph === "_" ? glyph : "_";
  }
  return built;
}

function escapeLabel(source: string): string {
  const noTick = source.split("`").join("");
  let flat = "";
  let breaking = false;
  for (const glyph of noTick) {
    if (glyph === "\n" || glyph === "\r") {
      if (breaking === false) flat += " ";
      breaking = true;
      continue;
    }
    breaking = false;
    flat += glyph === '"' ? "#" + "quot;" : glyph;
  }
  return flat;
}

function quote(label: string): string {
  return '"' + label + '"';
}

function emit(lines: string[], level: number, text: string): void {
  lines.push("  ".repeat(level) + text);
}

function done(lines: readonly string[]): string {
  return lines.join("\n").concat("\n");
}

function put<T>(
  lines: string[],
  level: number,
  items: readonly T[],
  render: (item: T) => string,
): void {
  for (const item of items) emit(lines, level, render(item));
}

function box(id: string, label: string, kind: "o" | "s" | "h" | "c" | "w"): string {
  const quoted = quote(label);
  if (kind === "o") return id + "([" + quoted + "])";
  if (kind === "h") return id + "{{" + quoted + "}}";
  if (kind === "c") return id + "[(" + quoted + ")]";
  if (kind === "w") return id + "[/" + quoted + "/]";
  return id + "[" + quoted + "]";
}

function subgraphOpen(id: string, title: string): string {
  return "subgraph " + safeId(id) + "[" + quote(title) + "]";
}

function arrowLine(from: string, to: string, arrow: string, label?: string): string {
  const head = safeId(from) + " " + arrow;
  if (label === undefined) return head + " " + safeId(to);
  return head + "|" + quote(label) + "| " + safeId(to);
}

const ENDPOINT_STYLE = ["fill:#eeeeef", "stroke:#9a9aa5", "color:#555566"].join(",");
const WORLD_STYLE = ["fill:#e8f0fe", "stroke:#4285f4"].join(",");
const RELAY_STYLE = ["fill:#fff2cc", "stroke:#d6b656"].join(",");

function classDef(name: string, style: string): string {
  return "classDef " + name + " " + style + ";";
}

function classUse(ids: readonly string[], name: string): string {
  return "class " + ids.join(",") + " " + name + ";";
}

function paint(lines: string[], name: string, style: string, ids: readonly string[]): void {
  if (ids.length === 0) return;
  emit(lines, 1, classDef(name, style));
  emit(lines, 1, classUse(ids, name));
}

function terminalsOf(edges: readonly { from: string; to: string }[]): string[] {
  return [FLOW_ENTRY, FLOW_SINK, FLOW_ABORT].filter((id) =>
    edges.some((edge) => edge.from === id || edge.to === id),
  );
}

function flowEdgeLabel(link: FlowEdge): string {
  return link.via === undefined ? link.kind : link.kind + " (" + link.via + ")";
}

export function siteGraphToMermaid(diagram: SiteGraph): string {
  const lines: string[] = [];
  emit(lines, 0, "flowchart TD");
  const asksByActor = new Map<string, SiteNode[]>();
  const placed = new Set<string>();
  for (const site of diagram.nodes) {
    if (site.kind !== "ask" || site.actors === undefined || site.actors.length !== 1) continue;
    const owner = site.actors[0];
    if (owner === undefined) continue;
    const bucket = asksByActor.get(owner) ?? [];
    bucket.push(site);
    asksByActor.set(owner, bucket);
    placed.add(site.id);
  }
  for (const person of diagram.actors) {
    const owned = asksByActor.get(person.id);
    if (owned === undefined || owned.length === 0) continue;
    emit(lines, 1, subgraphOpen(person.id, laneTitle(person)));
    put(lines, 2, owned, (ask) => siteNodeDef(ask, person.within));
    emit(lines, 1, "end");
  }
  put(
    lines,
    1,
    diagram.nodes.filter((site) => placed.has(site.id) === false),
    (site) => siteNodeDef(site, undefined),
  );
  put(lines, 1, diagram.edges, siteEdgeLine);
  emit(lines, 1, classDef("endpoint", ENDPOINT_STYLE));
  emit(lines, 1, classDef("world", WORLD_STYLE));
  emit(lines, 1, classDef("relay", RELAY_STYLE));
  const ids = (accept: (site: SiteNode) => boolean): string[] =>
    diagram.nodes.filter(accept).map((site) => safeId(site.id));
  const endpoints = ids((site) => site.kind === "source" || site.kind === "sink");
  const world = ids((site) => site.kind === "world-read");
  const relays = ids((site) => site.kind === "join" || site.kind === "fan-out");
  if (endpoints.length > 0) emit(lines, 1, classUse(endpoints, "endpoint"));
  if (world.length > 0) emit(lines, 1, classUse(world, "world"));
  if (relays.length > 0) emit(lines, 1, classUse(relays, "relay"));
  return done(lines);
}

function laneTitle(person: ActorSite): string {
  const title = escapeLabel(person.name ?? person.id);
  const family = person.within === undefined ? "" : "  \u00d7N per " + person.within;
  return title + " (" + person.id + ")" + family;
}

function siteNodeDef(site: SiteNode, laneFamily: string | undefined): string {
  const safe = safeId(site.id);
  if (site.kind === "ask") {
    const chunks = [escapeLabel(site.label), site.id];
    if (site.within !== undefined && site.within !== laneFamily) chunks.push("per " + site.within);
    return box(safe, chunks.join("<br/>"), "s");
  }
  if (site.kind === "world-read") {
    const chunks = [escapeLabel(site.label), site.id];
    if (site.within !== undefined) chunks.push("per " + site.within);
    return box(safe, chunks.join("<br/>"), "w");
  }
  if (site.kind === "source" || site.kind === "sink")
    return box(safe, escapeLabel(site.label), "o");
  const chunks = [site.id];
  if (site.kind === "join" && site.within !== undefined) chunks.push("per " + site.within);
  return box(safe, chunks.join("<br/>"), "h");
}

function siteEdgeLine(link: SiteEdge): string {
  if (link.kind === "context") return safeId(link.from) + " -. context .- " + safeId(link.to);
  const marker = link.exact ? "-->" : "-.->";
  const chunks: string[] = [];
  if (link.port !== undefined) chunks.push("port " + String(link.port));
  if (link.type !== undefined) chunks.push(escapeLabel(link.type));
  if (chunks.length === 0) return safeId(link.from) + " " + marker + " " + safeId(link.to);
  return (
    safeId(link.from) + " " + marker + "|" + quote(chunks.join(" \u00b7 ")) + "| " + safeId(link.to)
  );
}

export function actorGraphToMermaid(diagram: ActorGraph): string {
  const lines: string[] = [];
  emit(lines, 0, "flowchart LR");
  put(lines, 1, diagram.nodes, actorNodeDef);
  put(lines, 1, diagram.edges, actorEdgeLine);
  const terminals = diagram.nodes
    .filter((site) => site.id === "source" || site.id === "sink")
    .map((site) => safeId(site.id));
  paint(lines, "endpoint", ENDPOINT_STYLE, terminals);
  return done(lines);
}

function actorNodeDef(site: ActorNode): string {
  const safe = safeId(site.id);
  if (site.id === "source" || site.id === "sink") return box(safe, site.id, "o");
  if (site.id === "workspace") return box(safe, "workspace", "c");
  const family = site.family === undefined ? "" : " \u00d7N";
  return box(safe, escapeLabel(site.name ?? site.id) + family, "s");
}

function actorEdgeLine(link: ActorEdge): string {
  const marker = link.exact ? "-->" : "-.->";
  if (link.types !== undefined && link.types.length > 0) {
    const caption = link.types.map((typeName) => escapeLabel(typeName)).join(", ");
    const suffix = link.count > 1 ? " \u00d7" + String(link.count) : "";
    return arrowLine(link.from, link.to, marker, caption + suffix);
  }
  if (link.count > 1) return arrowLine(link.from, link.to, marker, "\u00d7" + String(link.count));
  return arrowLine(link.from, link.to, marker);
}

export function causalityGraphToMermaid(diagram: CausalityGraph): string {
  const lines: string[] = [];
  emit(lines, 0, "flowchart LR");
  const stepsByLane = new Map<string, Step[]>();
  for (const item of diagram.steps) {
    const bucket = stepsByLane.get(item.lane);
    if (bucket === undefined) stepsByLane.set(item.lane, [item]);
    else bucket.push(item);
  }
  for (const band of diagram.lanes) {
    const members = stepsByLane.get(band.id) ?? [];
    if (members.length === 0) continue;
    emit(lines, 1, subgraphOpen(band.id, causalityLaneTitle(band)));
    put(lines, 2, members, stepNodeDef);
    emit(lines, 1, "end");
  }
  if (diagram.sink !== undefined) emit(lines, 1, box("sink", "sink", "o"));
  put(lines, 1, diagram.edges, (link) => arrowLine(link.from, link.to, "-->"));
  put(lines, 1, diagram.sink?.fedBy ?? [], (fromId) => arrowLine(fromId, "sink", "-->"));
  if (diagram.sink !== undefined) {
    emit(lines, 1, classDef("endpoint", ENDPOINT_STYLE));
    emit(lines, 1, classUse(["sink"], "endpoint"));
  }
  return done(lines);
}

function multiplicity(depth: number): string {
  return ["N", "M", "K", "P"][depth] ?? "N";
}

function causalityLaneTitle(band: Lane): string {
  const title = escapeLabel(band.name ?? band.id);
  const head = band.name === undefined ? title : title + " (" + band.id + ")";
  const groups = band.families ?? [];
  if (groups.length === 0) return head;
  return head + "  \u00d7" + groups.map((_, index) => multiplicity(index)).join("\u00b7");
}

function stepNodeDef(item: Step): string {
  const chunks = [escapeLabel(item.label), item.id];
  if (item.repeat === "stack") chunks.push("\u00d7N");
  if (item.lanes !== undefined) chunks.push("may: " + item.lanes.join("|"));
  const safe = safeId(item.id);
  const caption = chunks.join("<br/>");
  return item.kind === "world-read" ? box(safe, caption, "w") : box(safe, caption, "s");
}

export function phaseGraphToMermaid(diagram: CausalityGraph): string {
  const lines: string[] = [];
  emit(lines, 0, "flowchart LR");
  const groups = diagram.phases ?? [];
  put(lines, 1, groups, (group) => box(safeId(group.id), escapeLabel(group.name ?? group.id), "s"));
  const ownerOf = new Map(diagram.steps.map((item) => [item.id, item.phase]));
  const feeding = new Set<string>();
  for (const id of diagram.sink?.fedBy ?? []) {
    const owner = ownerOf.get(id);
    if (owner !== undefined) feeding.add(owner);
  }
  if (diagram.sink !== undefined) emit(lines, 1, box("sink", "sink", "o"));
  put(lines, 1, diagram.phaseEdges ?? [], (link) => arrowLine(link.from, link.to, "-->"));
  put(
    lines,
    1,
    groups.filter((group) => feeding.has(group.id)),
    (group) => arrowLine(group.id, "sink", "-->"),
  );
  if (diagram.sink !== undefined) {
    emit(lines, 1, classDef("endpoint", ENDPOINT_STYLE));
    emit(lines, 1, classUse(["sink"], "endpoint"));
  }
  return done(lines);
}

export function phaseFlowToMermaid(diagram: ControlFlowGraph): string {
  const lines: string[] = [];
  emit(lines, 0, "flowchart LR");
  const links = diagram.phaseEdges ?? [];
  const terminals = terminalsOf(links);
  for (const id of terminals) if (id === FLOW_ENTRY) emit(lines, 1, box(id, id, "o"));
  const groups = diagram.phases ?? [];
  put(lines, 1, groups, (group) => box(safeId(group.id), escapeLabel(group.name ?? group.id), "s"));
  for (const id of terminals) if (id !== FLOW_ENTRY) emit(lines, 1, box(id, id, "o"));
  const grouped = new Map<string, { from: string; labels: string[]; to: string }>();
  for (const link of links) {
    const pairKey = link.from + "|" + link.to;
    const slot = grouped.get(pairKey) ?? { from: link.from, labels: [], to: link.to };
    const caption = flowEdgeLabel(link);
    if (slot.labels.includes(caption) === false) slot.labels.push(caption);
    grouped.set(pairKey, slot);
  }
  for (const slot of grouped.values()) {
    const shown = slot.labels.filter((caption) => caption !== "next");
    const marker = shown.length === 0 ? "-->" : "-->|" + quote(shown.join(", ")) + "|";
    emit(lines, 1, safeId(slot.from) + " " + marker + " " + safeId(slot.to));
  }
  const rank = new Map(groups.map((group, index) => [group.id, index]));
  const seenPairs = new Set<string>();
  for (const group of groups) {
    for (const peer of group.alongside ?? []) {
      const groupRank = rank.get(group.id) ?? rank.size;
      const peerRank = rank.get(peer) ?? rank.size;
      const fromId = groupRank < peerRank ? group.id : peer;
      const toId = groupRank < peerRank ? peer : group.id;
      const pairKey = fromId + "|" + toId;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      emit(lines, 1, safeId(fromId) + " -.->|" + quote("alongside") + "| " + safeId(toId));
    }
  }
  paint(lines, "endpoint", ENDPOINT_STYLE, terminals);
  return done(lines);
}

export function controlFlowToMermaid(diagram: ControlFlowGraph): string {
  const lines: string[] = [];
  emit(lines, 0, "flowchart TD");
  const terminals = terminalsOf(diagram.edges);
  const groups = diagram.phases;
  const titles = new Map((groups ?? []).map((group) => [group.id, group.name ?? group.id]));
  if (terminals.includes(FLOW_ENTRY)) emit(lines, 1, box(FLOW_ENTRY, FLOW_ENTRY, "o"));
  if (groups === undefined) put(lines, 1, diagram.nodes, (site) => flowNodeDef(site, titles));
  else {
    for (const group of groups) {
      const inside = diagram.nodes.filter((site) => site.phase === group.id);
      if (inside.length === 0) continue;
      emit(lines, 1, subgraphOpen(group.id, escapeLabel(group.name ?? group.id)));
      put(lines, 2, inside, (site) => flowNodeDef(site, titles));
      emit(lines, 1, "end");
    }
  }
  for (const id of terminals) if (id !== FLOW_ENTRY) emit(lines, 1, box(id, id, "o"));
  put(lines, 1, diagram.edges, (link) => {
    const marker = link.kind === "next" ? "-->" : "-->|" + quote(flowEdgeLabel(link)) + "|";
    return safeId(link.from) + " " + marker + " " + safeId(link.to);
  });
  paint(lines, "endpoint", ENDPOINT_STYLE, terminals);
  const marks = diagram.nodes.filter((site) => site.kind === "mark").map((site) => safeId(site.id));
  const floating = diagram.nodes.filter((site) => site.detached).map((site) => safeId(site.id));
  paint(lines, "mark", RELAY_STYLE, marks);
  paint(lines, "detached", "stroke-dasharray:4 3,color:#555566", floating);
  return done(lines);
}

function flowNodeDef(site: FlowNode, titles: ReadonlyMap<string, string>): string {
  const safe = safeId(site.id);
  const tail = site.detached === true ? "<br/>detached" : "";
  if (site.kind === "mark") {
    const title = escapeLabel(titles.get(site.phase) ?? site.phase);
    return box(safe, title + "<br/>" + site.id + tail, "h");
  }
  return box(safe, site.id + tail, "s");
}

export function handoffGraphToMermaid(
  diagram: HandoffGraph,
  catalog: Pick<CausalityGraph, "lanes" | "phases"> = { lanes: [] },
): string {
  const lines: string[] = [];
  emit(lines, 0, "flowchart LR");
  const laneTitleById = new Map(catalog.lanes.map((band) => [band.id, band.name]));
  const phaseTitleById = new Map(
    (catalog.phases ?? []).map((group) => [group.id, group.name ?? group.id]),
  );
  const peopleByPhase = new Map<string, HandoffParticipant[]>();
  for (const person of diagram.participants) {
    const bucket = peopleByPhase.get(person.phase);
    if (bucket === undefined) peopleByPhase.set(person.phase, [person]);
    else bucket.push(person);
  }
  for (const [phaseId, people] of peopleByPhase) {
    emit(lines, 1, subgraphOpen(phaseId, escapeLabel(phaseTitleById.get(phaseId) ?? phaseId)));
    put(lines, 2, people, (person) => participantNodeDef(person, laneTitleById.get(person.lane)));
    emit(lines, 1, "end");
  }
  put(lines, 1, diagram.handoffs, handoffEdgeLine);
  const workspaceIds = diagram.participants
    .filter((person) => person.lane === WORKSPACE_LANE)
    .map((person) => safeId(person.id));
  paint(lines, "world", WORLD_STYLE, workspaceIds);
  return done(lines);
}

function participantNodeDef(person: HandoffParticipant, title: string | undefined): string {
  let head = escapeLabel(title ?? person.lane);
  if (person.member !== undefined) {
    head += " [" + (person.member.index + 1) + "/" + person.member.of + "]";
  }
  if (person.many === true) head += " \u00d7N";
  const caption = head + "<br/>" + person.steps.join(", ");
  const safe = safeId(person.id);
  return person.lane === WORKSPACE_LANE ? box(safe, caption, "c") : box(safe, caption, "s");
}

function handoffEdgeLine(link: Handoff): string {
  const marker = link.back === true ? "-.->" : "-->";
  if (link.types === undefined || link.types.length === 0)
    return arrowLine(link.from, link.to, marker);
  const caption = link.types.map((typeName) => escapeLabel(typeName)).join(", ");
  return arrowLine(link.from, link.to, marker, caption);
}
