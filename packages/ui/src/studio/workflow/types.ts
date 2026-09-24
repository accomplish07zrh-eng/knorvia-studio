import type { Edge, Node } from "@xyflow/react";
import type { StudioKernelId } from "../types.js";

export const WORKFLOW_NODE_KINDS = [
  "start",
  "agent",
  "creation",
  "condition",
  "parallel",
  "join",
  "approval",
  "end",
] as const;
export type WorkflowNodeKind = (typeof WORKFLOW_NODE_KINDS)[number];
export type WorkflowTemplate = "blank" | "sequence" | "parallel" | "branch";
export const WORKFLOW_LIMITS = { name: 100, nodes: 200, edges: 800 } as const;

export interface WorkflowNodeData extends Record<string, unknown> {
  kind: WorkflowNodeKind;
  label: string;
  kernel: StudioKernelId;
  prompt: string;
  condition: string;
  retryCount: number;
  retryDelay: number;
  joinPolicy: "all" | "any";
  creationModelId?: string;
  creationReferencePath?: string;
  executionState?: string;
}
export type StudioWorkflowNode = Node<WorkflowNodeData, "studio">;
export type StudioWorkflowEdge = Edge;
export interface StudioWorkflow {
  id: string;
  name: string;
  workspacePath: string;
  nodes: StudioWorkflowNode[];
  edges: StudioWorkflowEdge[];
  updatedAt: number;
  workspaceMode?: "isolated" | "shared";
}
export interface WorkflowGraph {
  nodes: StudioWorkflowNode[];
  edges: StudioWorkflowEdge[];
}
export interface WorkflowIssue {
  code: string;
  nodeId?: string;
  edgeId?: string;
}

export function makeWorkflowNode(
  kind: WorkflowNodeKind,
  position: { x: number; y: number },
  label = "",
  id = crypto.randomUUID(),
): StudioWorkflowNode {
  return {
    id,
    type: "studio",
    position,
    data: {
      kind,
      label,
      kernel: "knorvia",
      prompt: "",
      condition: "",
      retryCount: 0,
      retryDelay: 5,
      joinPolicy: "all",
      ...(kind === "creation" ? { creationModelId: "", creationReferencePath: "" } : {}),
    },
  };
}

export function createWorkflowGraph(template: WorkflowTemplate): WorkflowGraph {
  if (template === "blank") return { nodes: [], edges: [] };
  const definitions: Array<[WorkflowNodeKind, number, number]> =
    template === "parallel"
      ? [
          ["start", 120, 220],
          ["parallel", 420, 220],
          ["agent", 720, 100],
          ["agent", 720, 340],
          ["join", 1020, 220],
          ["end", 1320, 220],
        ]
      : template === "branch"
        ? [
            ["start", 120, 220],
            ["condition", 420, 220],
            ["agent", 720, 100],
            ["agent", 720, 340],
            ["end", 1020, 220],
          ]
        : [
            ["start", 120, 220],
            ["agent", 420, 220],
            ["approval", 720, 220],
            ["end", 1020, 220],
          ];
  const nodes = definitions.map(([kind, x, y]) => makeWorkflowNode(kind, { x, y }));
  const links: Array<[number, number, string?]> =
    template === "parallel"
      ? [
          [0, 1],
          [1, 2],
          [1, 3],
          [2, 4],
          [3, 4],
          [4, 5],
        ]
      : template === "branch"
        ? [
            [0, 1],
            [1, 2, "yes"],
            [1, 3, "no"],
            [2, 4],
            [3, 4],
          ]
        : [
            [0, 1],
            [1, 2],
            [2, 3],
          ];
  return {
    nodes,
    edges: links.map(([source, target, sourceHandle]) => ({
      id: crypto.randomUUID(),
      source: nodes[source]!.id,
      target: nodes[target]!.id,
      ...(sourceHandle ? { sourceHandle } : {}),
      type: "smoothstep",
    })),
  };
}
