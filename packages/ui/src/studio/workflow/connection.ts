import type { Connection } from "@xyflow/react";
import type { StudioWorkflowEdge, WorkflowGraph } from "./types.js";
import { WORKFLOW_LIMITS } from "./types.js";

/** Single-output ports replace their previous link; parallel ports append distinct branches. */
export function connectWorkflow(
  graph: WorkflowGraph,
  connection: Connection,
): StudioWorkflowEdge[] {
  const source = graph.nodes.find((node) => node.id === connection.source);
  const target = graph.nodes.find((node) => node.id === connection.target);
  if (
    !source ||
    !target ||
    source.id === target.id ||
    source.data.kind === "end" ||
    target.data.kind === "start"
  )
    return graph.edges;
  if (source.data.kind === "condition" && !["yes", "no"].includes(connection.sourceHandle ?? ""))
    return graph.edges;
  const handle = source.data.kind === "condition" ? connection.sourceHandle : null;
  if (
    graph.edges.some(
      (edge) =>
        edge.source === source.id &&
        edge.target === target.id &&
        (edge.sourceHandle ?? null) === handle,
    )
  )
    return graph.edges;
  const edges = graph.edges.filter(
    (edge) =>
      edge.source !== source.id ||
      source.data.kind === "parallel" ||
      (source.data.kind === "condition" && edge.sourceHandle !== handle),
  );
  // 单出口替换不增加边数，在上限处仍应允许修正目标；新增分支遵守同一个上限。
  if (edges.length >= WORKFLOW_LIMITS.edges) return graph.edges;
  return [
    ...edges,
    {
      id: crypto.randomUUID(),
      source: source.id,
      target: target.id,
      sourceHandle: handle,
      targetHandle: null,
      type: "smoothstep",
    },
  ];
}
