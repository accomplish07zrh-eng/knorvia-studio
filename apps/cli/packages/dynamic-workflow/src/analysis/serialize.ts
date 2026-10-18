// SPDX-License-Identifier: Apache-2.0

import type { ActorEdge, ActorGraph, ActorNode } from "./actor-graph.js";
import type { CausalityGraph, Lane, OrderEdge, Phase, Region, Step } from "./causality-graph.js";
import type { ControlFlowGraph, FlowEdge, FlowNode, FlowPhase } from "./flow-graph.js";
import type { Handoff, HandoffGraph, HandoffParticipant } from "./handoff-graph.js";
import type { ActorSite, NamePattern, SiteEdge, SiteGraph, SiteNode } from "./types.js";

// Canonical text for the projected graphs. Node and actor labels are wrapped in
// quotes without escaping; artifact types escape an embedded `"`. Edge order for
// the site graph is from-rank, to-rank, kind (code-unit), then port.

function assemble(parts: readonly string[]): string {
  let text = "";
  let cursor = 0;
  while (cursor < parts.length) {
    const part = parts[cursor];
    if (part !== undefined) text += part;
    cursor += 1;
  }
  return text;
}

function closed(lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

function quoteField(text: string): string {
  let escaped = "";
  for (const ch of text) {
    if (ch === '"') escaped += "\\" + '"';
    else escaped += ch;
  }
  return '"' + escaped + '"';
}

function rawQuoted(text: string): string {
  return '"' + text + '"';
}

function atLoc(line: number, column: number): string {
  return "@" + String(line) + ":" + String(column);
}

function codeUnitOrder(left: string, right: string): number {
  const span = left.length < right.length ? left.length : right.length;
  let index = 0;
  while (index < span) {
    const gap = left.charCodeAt(index) - right.charCodeAt(index);
    if (gap !== 0) return gap;
    index += 1;
  }
  return left.length - right.length;
}

function positionsOf(nodes: readonly { id: string }[]): Map<string, number> {
  const position = new Map<string, number>();
  let index = 0;
  for (const node of nodes) {
    position.set(node.id, index);
    index += 1;
  }
  return position;
}

function rankOf(position: Map<string, number>, id: string): number {
  const found = position.get(id);
  if (found === undefined) return Number.MAX_SAFE_INTEGER;
  return found;
}

function exactWord(exact: boolean): string {
  if (exact) return "exact";
  return "inexact";
}

function orderNodes(nodes: readonly SiteNode[]): SiteNode[] {
  const sources: SiteNode[] = [];
  const sinks: SiteNode[] = [];
  const middle: SiteNode[] = [];
  for (const node of nodes) {
    switch (node.kind) {
      case "source":
        sources.push(node);
        break;
      case "sink":
        sinks.push(node);
        break;
      default:
        middle.push(node);
        break;
    }
  }
  return sources.concat(middle, sinks);
}

function compareSiteEdges(left: SiteEdge, right: SiteEdge, position: Map<string, number>): number {
  const fromGap = rankOf(position, left.from) - rankOf(position, right.from);
  if (fromGap !== 0) return fromGap;
  const toGap = rankOf(position, left.to) - rankOf(position, right.to);
  if (toGap !== 0) return toGap;
  const kindGap = codeUnitOrder(left.kind, right.kind);
  if (kindGap !== 0) return kindGap;
  const leftPort = left.port === undefined ? -1 : left.port;
  const rightPort = right.port === undefined ? -1 : right.port;
  return leftPort - rightPort;
}

function renderNode(node: SiteNode): string {
  if (node.loc === undefined) return assemble(["node ", node.id]);
  const loc = node.loc;
  const parts: string[] = [
    "node ",
    node.id,
    " ",
    rawQuoted(node.label),
    " ",
    atLoc(loc.line, loc.column),
  ];
  const actors = node.actors;
  if (actors !== undefined && actors.length > 0) parts.push(" actors=", actors.join(","));
  if (node.within !== undefined) parts.push(" within=", node.within);
  if (node.artifactType !== undefined) parts.push(" type=", quoteField(node.artifactType));
  return assemble(parts);
}

function renderActor(actor: ActorSite): string {
  const parts: string[] = ["actor ", actor.id];
  if (actor.name !== undefined) parts.push(" ", rawQuoted(actor.name));
  parts.push(" ", atLoc(actor.loc.line, actor.loc.column));
  if (actor.within !== undefined) parts.push(" within=", actor.within);
  return assemble(parts);
}

function renderEdge(edge: SiteEdge): string {
  const parts: string[] = [
    "edge ",
    edge.from,
    " -> ",
    edge.to,
    " ",
    edge.kind,
    " ",
    exactWord(edge.exact),
  ];
  if (edge.port !== undefined) parts.push(" port=", String(edge.port));
  if (edge.type !== undefined) parts.push(" type=", quoteField(edge.type));
  return assemble(parts);
}

export function serializeGraph(graph: SiteGraph): string {
  const ordered = orderNodes(graph.nodes);
  const position = positionsOf(ordered);
  const edges = graph.edges.slice();
  edges.sort(function bySiteEdge(left, right) {
    return compareSiteEdges(left, right, position);
  });
  const lines: string[] = [];
  for (const node of ordered) lines.push(renderNode(node));
  for (const actor of graph.actors) lines.push(renderActor(actor));
  for (const edge of edges) lines.push(renderEdge(edge));
  return closed(lines);
}

function compareActorEdges(
  left: ActorEdge,
  right: ActorEdge,
  position: Map<string, number>,
): number {
  const fromGap = rankOf(position, left.from) - rankOf(position, right.from);
  if (fromGap !== 0) return fromGap;
  return rankOf(position, left.to) - rankOf(position, right.to);
}

function renderActorNode(node: ActorNode): string {
  const parts: string[] = ["actor-node ", node.id];
  if (node.name !== undefined) parts.push(" ", rawQuoted(node.name));
  if (node.loc !== undefined) parts.push(" ", atLoc(node.loc.line, node.loc.column));
  if (node.family !== undefined) parts.push(" family=", node.family);
  return assemble(parts);
}

function renderActorEdge(edge: ActorEdge): string {
  const parts: string[] = [
    "actor-edge ",
    edge.from,
    " -> ",
    edge.to,
    " ",
    exactWord(edge.exact),
    " count=",
    String(edge.count),
  ];
  const types = edge.types;
  if (types !== undefined && types.length > 0) {
    const quoted: string[] = [];
    for (const type of types) quoted.push(quoteField(type));
    parts.push(" types=", quoted.join(","));
  }
  return assemble(parts);
}

export function serializeActorGraph(graph: ActorGraph): string {
  const position = positionsOf(graph.nodes);
  const edges = graph.edges.slice();
  edges.sort(function byActorEdge(left, right) {
    return compareActorEdges(left, right, position);
  });
  const lines: string[] = [];
  for (const node of graph.nodes) lines.push(renderActorNode(node));
  for (const edge of edges) lines.push(renderActorEdge(edge));
  return closed(lines);
}

function renderPhase(phase: Phase): string {
  const parts: string[] = ["phase ", phase.id];
  if (phase.name !== undefined) parts.push(" ", rawQuoted(phase.name));
  if (phase.loc !== undefined) parts.push(" ", atLoc(phase.loc.line, phase.loc.column));
  return assemble(parts);
}

function renderPhaseEdge(edge: OrderEdge): string {
  return assemble(["phase-edge ", edge.from, " -> ", edge.to, " ", edge.kind, " ", edge.certainty]);
}

function affixSuffix(field: "name" | "label", pattern: NamePattern | undefined): string {
  if (pattern === undefined) return "";
  const parts: string[] = [];
  if (pattern.head !== undefined) parts.push(" ", field, "-head=", quoteField(pattern.head));
  if (pattern.tail !== undefined) parts.push(" ", field, "-tail=", quoteField(pattern.tail));
  return assemble(parts);
}

function renderLane(lane: Lane): string {
  const parts: string[] = ["lane ", lane.id];
  if (lane.name !== undefined) parts.push(" ", rawQuoted(lane.name));
  parts.push(affixSuffix("name", lane.namePattern));
  if (lane.loc !== undefined) parts.push(" ", atLoc(lane.loc.line, lane.loc.column));
  const families = lane.families;
  if (families !== undefined && families.length > 0) parts.push(" families=", families.join(","));
  return assemble(parts);
}

function renderRegion(region: Region): string {
  const parts: string[] = ["region ", region.id, " ", region.kind];
  if (region.parent !== undefined) parts.push(" parent=", region.parent);
  if (region.loc !== undefined) parts.push(" ", atLoc(region.loc.line, region.loc.column));
  if (region.bound !== undefined) parts.push(" bound=", String(region.bound));
  if (region.label !== undefined) parts.push(" label=", quoteField(region.label));
  return assemble(parts);
}

function renderStep(step: Step): string {
  const parts: string[] = [
    "step ",
    step.id,
    " ",
    step.kind,
    " ",
    rawQuoted(step.label),
    affixSuffix("label", step.labelPattern),
    " ",
    atLoc(step.loc.line, step.loc.column),
    " lane=",
    step.lane,
  ];
  if (step.lanes !== undefined) parts.push(" lanes=", step.lanes.join(","));
  if (step.source !== undefined) parts.push(" source=", step.source);
  if (step.phase !== undefined) parts.push(" phase=", step.phase);
  parts.push(" region=", step.region, " ", step.certainty);
  if (step.repeat !== undefined) parts.push(" ", step.repeat);
  return assemble(parts);
}

function renderOrderEdge(edge: OrderEdge): string {
  const parts: string[] = [
    "edge ",
    edge.from,
    " -> ",
    edge.to,
    " ",
    edge.kind,
    " ",
    edge.certainty,
  ];
  if (edge.exact !== undefined) parts.push(edge.exact ? " exact" : " inexact");
  return assemble(parts);
}

export function serializeCausalityGraph(graph: CausalityGraph): string {
  const lines: string[] = [];
  const phases = graph.phases;
  if (phases !== undefined) {
    for (const phase of phases) lines.push(renderPhase(phase));
  }
  for (const lane of graph.lanes) lines.push(renderLane(lane));
  for (const region of graph.regions) lines.push(renderRegion(region));
  for (const step of graph.steps) lines.push(renderStep(step));
  for (const edge of graph.edges) lines.push(renderOrderEdge(edge));
  const phaseEdges = graph.phaseEdges;
  if (phaseEdges !== undefined) {
    for (const edge of phaseEdges) lines.push(renderPhaseEdge(edge));
  }
  const sink = graph.sink;
  if (sink !== undefined) lines.push(assemble(["sink ", sink.fedBy.join(",")]));
  return closed(lines);
}

function flowEdgeLine(head: string, edge: FlowEdge): string {
  const parts: string[] = [head, " ", edge.from, " -> ", edge.to, " ", edge.kind];
  if (edge.via !== undefined) parts.push(" via=", edge.via);
  return assemble(parts);
}

function renderFlowPhase(phase: FlowPhase): string {
  const parts: string[] = ["phase ", phase.id];
  if (phase.name !== undefined) parts.push(" ", quoteField(phase.name));
  if (phase.alongside !== undefined) parts.push(" alongside=", phase.alongside.join(","));
  return assemble(parts);
}

function renderFlowNode(node: FlowNode): string {
  const parts: string[] = ["node ", node.id, " ", node.kind];
  if (node.site !== undefined) parts.push(" site=", node.site);
  parts.push(" phase=", node.phase);
  if (node.alongside !== undefined) parts.push(" alongside=", node.alongside.join(","));
  if (node.detached === true) parts.push(" detached");
  return assemble(parts);
}

export function serializeControlFlow(flow: ControlFlowGraph): string {
  const lines: string[] = [];
  const phases = flow.phases;
  if (phases !== undefined) {
    for (const phase of phases) lines.push(renderFlowPhase(phase));
  }
  for (const node of flow.nodes) lines.push(renderFlowNode(node));
  for (const edge of flow.edges) lines.push(flowEdgeLine("edge", edge));
  const phaseEdges = flow.phaseEdges;
  if (phaseEdges !== undefined) {
    for (const edge of phaseEdges) lines.push(flowEdgeLine("phase-edge", edge));
  }
  return closed(lines);
}

function laneNames(lanes: readonly Lane[]): Map<string, string | undefined> {
  const nameOf = new Map<string, string | undefined>();
  for (const lane of lanes) nameOf.set(lane.id, lane.name);
  return nameOf;
}

function renderParticipant(
  participant: HandoffParticipant,
  nameOf: Map<string, string | undefined>,
): string {
  const parts: string[] = ["participant ", participant.id];
  const name = nameOf.get(participant.lane);
  if (name !== undefined) parts.push(" ", quoteField(name));
  const member = participant.member;
  if (member !== undefined) {
    parts.push(" member=", String(member.index), "/", String(member.of));
  }
  if (participant.many === true) parts.push(" many");
  parts.push(" steps=", participant.steps.join(","));
  return assemble(parts);
}

function renderHandoff(edge: Handoff): string {
  const parts: string[] = ["handoff ", edge.from, " -> ", edge.to];
  if (edge.back === true) parts.push(" back");
  if (edge.types !== undefined) parts.push(" types=", quoteField(edge.types.join(",")));
  return assemble(parts);
}

export function serializeHandoffGraph(graph: HandoffGraph, lanes: readonly Lane[]): string {
  const nameOf = laneNames(lanes);
  const lines: string[] = [];
  let current: string | undefined;
  for (const participant of graph.participants) {
    if (participant.phase !== current) {
      current = participant.phase;
      lines.push(assemble(["phase ", current]));
    }
    lines.push(renderParticipant(participant, nameOf));
  }
  for (const edge of graph.handoffs) lines.push(renderHandoff(edge));
  return closed(lines);
}
