import type {
  StudioWorkflowDefinition,
  StudioWorkflowEdge,
  StudioWorkflowNode,
} from "../workflowTypes.js";
import { studioConditionReferences } from "./condition.js";
import { isStudioKernelId } from "./kernelIdentity.js";

const KINDS = new Set([
  "start",
  "agent",
  "creation",
  "condition",
  "parallel",
  "join",
  "approval",
  "end",
]);
export interface StudioWorkflowGraph {
  nodes: Map<string, StudioWorkflowNode>;
  incoming: Map<string, StudioWorkflowEdge[]>;
  outgoing: Map<string, StudioWorkflowEdge[]>;
  order: string[];
}
export function studioWorkflowGraph(definition: StudioWorkflowDefinition): StudioWorkflowGraph {
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]));
  const incoming = new Map(definition.nodes.map((node) => [node.id, [] as StudioWorkflowEdge[]]));
  const outgoing = new Map(definition.nodes.map((node) => [node.id, [] as StudioWorkflowEdge[]]));
  for (const edge of definition.edges) {
    incoming.get(edge.target)?.push(edge);
    outgoing.get(edge.source)?.push(edge);
  }
  const degree = new Map([...incoming].map(([id, edges]) => [id, edges.length]));
  const order = [...nodes.keys()].filter((id) => degree.get(id) === 0);
  for (let i = 0; i < order.length; i++)
    for (const edge of outgoing.get(order[i]!) ?? []) {
      const count = degree.get(edge.target)! - 1;
      degree.set(edge.target, count);
      if (count === 0) order.push(edge.target);
    }
  return { nodes, incoming, outgoing, order };
}
export function workflowAncestors(graph: StudioWorkflowGraph, id: string): Set<string> {
  const found = new Set<string>();
  const pending = [id];
  for (let i = 0; i < pending.length; i++)
    for (const edge of graph.incoming.get(pending[i]!) ?? [])
      if (!found.has(edge.source)) {
        found.add(edge.source);
        pending.push(edge.source);
      }
  return found;
}
export function validateStudioWorkflow(definition: StudioWorkflowDefinition): string[] {
  if (!definition || !Array.isArray(definition.nodes) || !Array.isArray(definition.edges))
    return ["Workflow nodes and edges must be arrays."];
  if (!definition.nodes.length || definition.nodes.length > 200 || definition.edges.length > 800)
    return ["Workflow requires 1–200 nodes and at most 800 edges."];
  const issues: string[] = [];
  const ids = new Set<string>();
  const edgeIds = new Set<string>();
  const pairs = new Set<string>();
  for (const node of definition.nodes) {
    if (
      !node ||
      typeof node.id !== "string" ||
      !node.id ||
      node.id.length > 200 ||
      ["input", "output", "__proto__", "constructor", "prototype"].includes(node.id) ||
      ids.has(node.id)
    ) {
      issues.push("Invalid, reserved or duplicate node ID.");
      continue;
    }
    ids.add(node.id);
    const data = node.data;
    if (!data || !KINDS.has(data.kind)) {
      issues.push(`Unknown node kind: ${node.id}.`);
      continue;
    }
    if (
      typeof data.prompt !== "string" ||
      data.prompt.length > 20_000 ||
      typeof data.condition !== "string" ||
      data.condition.length > 2000 ||
      !isStudioKernelId(data.kernel)
    )
      issues.push(`Invalid node configuration: ${node.id}.`);
    if (
      !Number.isInteger(data.retryCount) ||
      data.retryCount < 0 ||
      data.retryCount > 5 ||
      !Number.isInteger(data.retryDelay) ||
      data.retryDelay < 0 ||
      data.retryDelay > 3600
    )
      issues.push(`Invalid retry policy: ${node.id}.`);
    if (!["all", "any"].includes(data.joinPolicy)) issues.push(`Invalid join policy: ${node.id}.`);
    if (
      ["agent", "approval"].includes(data.kind) &&
      (typeof data.prompt !== "string" || !data.prompt.trim())
    )
      issues.push(`Node requires instructions: ${node.id}.`);
    if (
      data.kind === "creation" &&
      (!data.prompt.trim() ||
        typeof data.creationModelId !== "string" ||
        !/^[\w-]{1,100}$/.test(data.creationModelId))
    )
      issues.push(`Creation node requires a model and prompt: ${node.id}.`);
    if (
      data.kind === "creation" &&
      data.creationReferencePath !== undefined &&
      (typeof data.creationReferencePath !== "string" || data.creationReferencePath.length > 2048)
    )
      issues.push(`Invalid creation reference path: ${node.id}.`);
  }
  for (const edge of definition.edges) {
    if (
      !edge ||
      typeof edge.id !== "string" ||
      !edge.id ||
      edge.id.length > 200 ||
      edgeIds.has(edge.id) ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      edge.source === edge.target
    ) {
      issues.push("Invalid, duplicate or self-referencing edge.");
      continue;
    }
    edgeIds.add(edge.id);
    const pair = JSON.stringify([edge.source, edge.target, edge.sourceHandle ?? null]);
    if (pairs.has(pair)) issues.push("Duplicate edge connection.");
    pairs.add(pair);
  }
  if (issues.length) return issues;
  const graph = studioWorkflowGraph(definition);
  if (graph.order.length !== definition.nodes.length) return ["Workflow contains a cycle."];
  if (definition.nodes.filter((node) => node.data.kind === "start").length !== 1)
    issues.push("Workflow requires exactly one start.");
  if (!definition.nodes.some((node) => node.data.kind === "end"))
    issues.push("Workflow requires an end.");
  const reachable = new Set<string>();
  const finishing = new Set<string>();
  for (const id of graph.order) {
    const node = graph.nodes.get(id)!;
    const input = graph.incoming.get(id)!;
    const output = graph.outgoing.get(id)!;
    if (node.data.kind === "start" || input.some((edge) => reachable.has(edge.source)))
      reachable.add(id);
    if (node.data.kind === "start" ? input.length !== 0 || output.length !== 1 : input.length === 0)
      issues.push(`Invalid incoming edges: ${id}.`);
    if (node.data.kind === "condition") {
      if (
        output.length !== 2 ||
        output.filter((edge) => edge.sourceHandle === "yes").length !== 1 ||
        output.filter((edge) => edge.sourceHandle === "no").length !== 1
      )
        issues.push(`Condition requires yes/no edges: ${id}.`);
      try {
        const ancestors = workflowAncestors(graph, id);
        for (const ref of studioConditionReferences(node.data.condition))
          if (!ancestors.has(ref))
            issues.push(`Condition ${id} references a non-ancestor: ${ref}.`);
      } catch (error) {
        issues.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (
      node.data.kind === "end"
        ? output.length !== 0
        : node.data.kind === "parallel"
          ? new Set(output.map((edge) => edge.target)).size < 2
          : output.length !== 1
    )
      issues.push(`Invalid outgoing edges: ${id}.`);
    if (node.data.kind === "join" && input.length < 2)
      issues.push(`Join requires two incoming edges: ${id}.`);
    if (
      node.data.kind !== "condition" &&
      output.some((edge) => edge.sourceHandle && edge.sourceHandle !== "out")
    )
      issues.push(`Unexpected branch handle: ${id}.`);
    if (["agent", "approval"].includes(node.data.kind)) {
      const ancestors = workflowAncestors(graph, id);
      for (const match of node.data.prompt.matchAll(/\{\{([^{}]+)\}\}/g)) {
        const ref = match[1]!.trim();
        if (ref !== "input" && ref !== "output" && !ancestors.has(ref))
          issues.push(`Prompt ${id} references a non-ancestor: ${ref}.`);
      }
    }
  }
  for (const id of [...graph.order].reverse())
    if (
      graph.nodes.get(id)!.data.kind === "end" ||
      graph.outgoing.get(id)!.some((edge) => finishing.has(edge.target))
    )
      finishing.add(id);
  for (const id of graph.order)
    if (!reachable.has(id) || !finishing.has(id))
      issues.push(`Node is disconnected from start or end: ${id}.`);
  return issues;
}

/** Only exclusive ancestors of the losing branches may be stopped; shared consumers keep their work. */
export function workflowAnyLosers(
  graph: StudioWorkflowGraph,
  joinId: string,
  winner: string,
): Set<string> {
  const keep = workflowAncestors(graph, winner);
  keep.add(winner);
  const candidates = workflowAncestors(graph, joinId);
  const reachesOnlyJoin = new Map<string, boolean>([[joinId, true]]);
  for (const id of [...graph.order].reverse()) {
    if (id === joinId) continue;
    const outputs = graph.outgoing.get(id)!;
    reachesOnlyJoin.set(
      id,
      outputs.length > 0 && outputs.every((edge) => reachesOnlyJoin.get(edge.target) === true),
    );
  }
  return new Set([...candidates].filter((id) => !keep.has(id) && reachesOnlyJoin.get(id)));
}
