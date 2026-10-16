// SPDX-License-Identifier: Apache-2.0

import { UNPHASED_ID } from "./constants.js";
import type { OrderTrace } from "./causality-order.js";
import {
  FLOW_ABORT,
  FLOW_ENTRY,
  FLOW_SINK,
  type FlowEdge,
  type FlowNode,
  type FlowPhase,
} from "./flow-graph.js";

// Phases that actually appear on a node. Unphased leads; the rest follow first reach.
export function collectFlowPhases(order: OrderTrace, flowNodes: readonly FlowNode[]): FlowPhase[] {
  const used = new Set<string>();
  for (let index = 0; index < flowNodes.length; index += 1) {
    const flowNode = flowNodes[index];
    if (flowNode !== undefined) used.add(flowNode.phase);
  }
  const at = reachOrder(order);
  const companions = alongsideByPhase(flowNodes);
  const listed: FlowPhase[] = [];
  if (used.has(UNPHASED_ID))
    listed.push(phaseRecord(UNPHASED_ID, undefined, undefined, companions, at));
  for (let index = 0; index < order.phases.length; index += 1) {
    const phase = order.phases[index];
    if (phase === undefined || !used.has(phase.id)) continue;
    listed.push(phaseRecord(phase.id, phase.loc, phase.name, companions, at));
  }
  return listed;
}

// Same-phase edges drop out unless they are loop backs. Terminals stay themselves.
export function quotientFlow(
  flowNodes: readonly FlowNode[],
  flowEdges: readonly FlowEdge[],
  phaseList: readonly FlowPhase[],
): FlowEdge[] {
  const phaseByNode = new Map<string, string>();
  for (let index = 0; index < flowNodes.length; index += 1) {
    const flowNode = flowNodes[index];
    if (flowNode !== undefined) phaseByNode.set(flowNode.id, flowNode.phase);
  }
  const at = quotientOrder(phaseList);
  const taken = new Set<string>();
  const folded: FlowEdge[] = [];
  for (let index = 0; index < flowEdges.length; index += 1) {
    const link = flowEdges[index];
    if (link === undefined) continue;
    const origin = phaseByNode.get(link.from) ?? link.from;
    const dest = phaseByNode.get(link.to) ?? link.to;
    if (origin === dest && link.kind !== "loop") continue;
    const key = [origin, dest, link.kind, link.via ?? ""].join("|");
    if (taken.has(key)) continue;
    taken.add(key);
    folded.push(
      link.via === undefined
        ? { from: origin, kind: link.kind, to: dest }
        : { from: origin, kind: link.kind, to: dest, via: link.via },
    );
  }
  folded.sort((left, right) => compareEdges(at, left, right));
  return folded;
}

function reachOrder(order: OrderTrace): (id: string) => number {
  const place = new Map<string, number>();
  for (let index = 0; index < order.phases.length; index += 1) {
    const phase = order.phases[index];
    if (phase !== undefined) place.set(phase.id, index + 1);
  }
  place.set(UNPHASED_ID, 0);
  return (id: string): number => {
    const placed = place.get(id);
    return placed === undefined ? place.size : placed;
  };
}

function alongsideByPhase(flowNodes: readonly FlowNode[]): Map<string, Set<string>> {
  const companions = new Map<string, Set<string>>();
  for (let index = 0; index < flowNodes.length; index += 1) {
    const flowNode = flowNodes[index];
    if (flowNode === undefined || flowNode.alongside === undefined) continue;
    let bucket = companions.get(flowNode.phase);
    if (bucket === undefined) {
      bucket = new Set<string>();
      companions.set(flowNode.phase, bucket);
    }
    for (let slot = 0; slot < flowNode.alongside.length; slot += 1) {
      const id = flowNode.alongside[slot];
      if (id !== undefined && id !== flowNode.phase) bucket.add(id);
    }
  }
  return companions;
}

function phaseRecord(
  id: string,
  loc: FlowPhase["loc"],
  name: FlowPhase["name"],
  companions: Map<string, Set<string>>,
  at: (id: string) => number,
): FlowPhase {
  const ids = [...(companions.get(id) ?? [])];
  ids.sort((left, right) => at(left) - at(right));
  if (loc === undefined && name === undefined) {
    return ids.length === 0 ? { id } : { id, alongside: ids };
  }
  return ids.length === 0 ? { id, loc, name } : { id, loc, name, alongside: ids };
}

function quotientOrder(phaseList: readonly FlowPhase[]): (id: string) => number {
  const place = new Map<string, number>();
  for (let index = 0; index < phaseList.length; index += 1) {
    const phase = phaseList[index];
    if (phase !== undefined) place.set(phase.id, index);
  }
  place.set(FLOW_ENTRY, -1);
  place.set(FLOW_SINK, phaseList.length);
  place.set(FLOW_ABORT, phaseList.length + 1);
  const past = phaseList.length + 2;
  return (id: string): number => {
    const placed = place.get(id);
    return placed === undefined ? past : placed;
  };
}

function compareEdges(at: (id: string) => number, left: FlowEdge, right: FlowEdge): number {
  const fromDelta = at(left.from) - at(right.from);
  if (fromDelta !== 0) return fromDelta;
  const toDelta = at(left.to) - at(right.to);
  if (toDelta !== 0) return toDelta;
  const kindDelta = left.kind.localeCompare(right.kind);
  if (kindDelta !== 0) return kindDelta;
  return (left.via ?? "").localeCompare(right.via ?? "");
}
