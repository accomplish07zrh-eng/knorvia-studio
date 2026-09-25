import type { Edge, Node } from "@xyflow/react";
import {
  STUDIO_WORKFLOW_NODE_KINDS,
  type StudioWorkflowNodeData,
  type StudioWorkflowNodeKind,
} from "@knorvia/services";
import {
  EVIDENCE_RULE,
  TASK_TEMPLATES,
  TEMPLATE_SCENARIOS,
  type ScenarioLanguage,
  type TaskTemplate,
  type TemplateScenario,
  type TemplateStep,
} from "./templateScenarios.js";

/**
 * 业务来源只有一处：services 的浏览器安全公开入口。
 * 这里只做重导出，避免 UI 与运行时各自维护一份节点种类清单。
 */
export const WORKFLOW_NODE_KINDS = STUDIO_WORKFLOW_NODE_KINDS;
export type WorkflowNodeKind = StudioWorkflowNodeKind;
/** 场景模板的数据在 `templateScenarios.ts`；这里只把它们并入唯一一份模板清单。 */
export {
  TASK_TEMPLATES,
  TEMPLATE_SCENARIOS,
  templateParameterNames,
  workflowParamHint,
  type ScenarioLanguage,
  type TaskTemplate,
} from "./templateScenarios.js";
export const WORKFLOW_TEMPLATES = [
  "blank",
  "sequence",
  "parallel",
  "branch",
  ...TASK_TEMPLATES,
] as const;
export type WorkflowTemplate = (typeof WORKFLOW_TEMPLATES)[number];
export const WORKFLOW_LIMITS = { name: 100, nodes: 200, edges: 800 } as const;

/**
 * 显示层数据：业务字段来自 services 契约，UI 只叠加画布执行态。
 * React Flow 的 `Node`／`Edge`／`position` 仍留在 UI，不进入业务核心。
 */
export interface WorkflowNodeData extends StudioWorkflowNodeData {
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

function isTaskTemplate(template: WorkflowTemplate): template is TaskTemplate {
  return (TASK_TEMPLATES as readonly string[]).includes(template);
}

/**
 * 把一个场景步骤变成画布节点。
 * 参数 label 在构造时按当前语言落地（参数 schema 是单语言字符串）；`{{param.*}}` 的
 * 可用性仍由服务端校验，这里不预判。
 */
function scenarioNode(
  scenario: TemplateScenario,
  step: TemplateStep,
  language: ScenarioLanguage,
  x: number,
): StudioWorkflowNode {
  const node = makeWorkflowNode(step.kind, { x, y: 220 }, step.label[language]);
  node.data.prompt =
    step.kind === "agent"
      ? `${step.prompt[language]} ${EVIDENCE_RULE[language]}`
      : step.prompt[language];
  if (step.params?.length)
    node.data.params = step.params.map((param) => ({
      ...param,
      label: scenario.paramText[param.name]?.label[language] ?? param.name,
    }));
  if (step.outputNames?.length) node.data.outputNames = [...step.outputNames];
  if (step.permission) node.data.permission = step.permission;
  if (step.creationModelId) node.data.creationModelId = step.creationModelId;
  return node;
}

export function createWorkflowGraph(
  template: WorkflowTemplate,
  language: ScenarioLanguage = "zh",
): WorkflowGraph {
  if (template === "blank") return { nodes: [], edges: [] };
  if (isTaskTemplate(template)) {
    const scenario = TEMPLATE_SCENARIOS[template];
    const nodes = [
      makeWorkflowNode("start", { x: 120, y: 220 }),
      ...scenario.steps.map((step, index) =>
        scenarioNode(scenario, step, language, 420 + index * 300),
      ),
      makeWorkflowNode("end", { x: 420 + scenario.steps.length * 300, y: 220 }),
    ];
    return {
      nodes,
      edges: nodes.slice(0, -1).map((node, index) => ({
        id: crypto.randomUUID(),
        source: node.id,
        target: nodes[index + 1]!.id,
        type: "smoothstep",
      })),
    };
  }
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
