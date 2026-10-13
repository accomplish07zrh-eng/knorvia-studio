// SPDX-License-Identifier: Apache-2.0
// 相位图与节点状态更新：把工作流定义的相位顺序映射成图，并支持只改阶段节点状态。
import type {
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowNodeStatus,
  WorkflowPhaseDefinition,
} from "@knorvia/contracts";
import { workflowDefinitionPhaseMap } from "../definition.js";
import { phaseNodeId } from "./ids.js";

/** 图规格：按相位顺序折叠出节点与相邻边，依赖即前驱 id。 */
const graphSpec = (
  phases: readonly WorkflowPhaseDefinition[],
): { edges: WorkflowGraph["edges"]; nodes: WorkflowGraphNode[] } =>
  phases.reduce<{ edges: WorkflowGraph["edges"]; nodes: WorkflowGraphNode[] }>(
    (spec, phase) => {
      const id = phaseNodeId(phase.phase);
      const predecessor = spec.nodes.at(-1)?.id;
      const edges =
        predecessor === undefined ? spec.edges : [...spec.edges, { from: predecessor, to: id }];
      const node: WorkflowGraphNode = {
        dependsOn: predecessor === undefined ? [] : [predecessor],
        description: phase.description,
        id,
        kind: "phase",
        phase: phase.phase,
        status: "pending",
        title: phase.title,
      };
      return { edges, nodes: [...spec.nodes, node] };
    },
    { edges: [], nodes: [] },
  );
/** 相位图：节点顺序即 phaseOrder，缺失相位定义时立即报错。 */
export function createPhaseGraph(definition: WorkflowDefinition): WorkflowGraph {
  const phaseMap = workflowDefinitionPhaseMap(definition);
  const phases = definition.phaseOrder.map((phase) => {
    const found = phaseMap.get(phase);
    if (!found) {
      throw new Error(`${definition.title} definition is missing phase: ${phase}`);
    }
    return found;
  });
  const spec = graphSpec(phases);
  return { ...spec, collections: [] };
}

/** 节点状态更新：只改阶段节点自身，不触碰依赖与集合；状态为空时原样返回。 */
export function updateGraphNodeStatus(
  graph: WorkflowGraph,
  phaseName: string,
  nextStatus: WorkflowNodeStatus | undefined,
): WorkflowGraph {
  if (nextStatus === undefined) return graph;
  const target = phaseNodeId(phaseName);
  const index = graph.nodes.findIndex((node) => node.id === target && node.kind === "phase");
  if (index < 0) return { collections: graph.collections, edges: graph.edges, nodes: graph.nodes };
  const nodes = graph.nodes.map((node, position) =>
    position === index ? { ...node, status: nextStatus } : node,
  );
  return { collections: graph.collections, edges: graph.edges, nodes };
}
