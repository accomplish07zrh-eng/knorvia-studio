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
export const WORKFLOW_TEMPLATES = [
  "blank",
  "sequence",
  "parallel",
  "branch",
  "releaseCheck",
  "codeReview",
  "documentCleanup",
] as const;
export type WorkflowTemplate = (typeof WORKFLOW_TEMPLATES)[number];
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

const taskTemplates = {
  releaseCheck: {
    zh: [
      [
        "检查发布条件",
        "检查项目的测试、构建、版本号与待提交改动。逐项列出实际执行的命令、结果及未验证项；不要发布或推送。",
      ],
      [
        "整理发布风险",
        "根据上一步结果整理阻断项、回退建议和可供人工确认的发布清单；不要把未运行的检查写成通过。",
      ],
    ],
    en: [
      [
        "Check release readiness",
        "Inspect tests, build, version, and pending changes. Report commands actually run, results, and gaps. Do not publish or push.",
      ],
      [
        "Summarize release risks",
        "From the previous result, list blockers, rollback considerations, and a checklist for human review. Do not claim unrun checks passed.",
      ],
    ],
  },
  codeReview: {
    zh: [
      [
        "审查代码改动",
        "检查项目中的待审改动，定位可能的正确性、安全性和兼容性问题；按文件给出可核对的依据。不要修改文件。",
      ],
      [
        "汇总审查结论",
        "核对上一步发现，按严重程度整理问题、建议测试和仍需人工确认的事项；不要把推测写成已复现。",
      ],
    ],
    en: [
      [
        "Review code changes",
        "Inspect pending changes for correctness, security, and compatibility issues. Cite verifiable files. Do not edit files.",
      ],
      [
        "Summarize findings",
        "Check the previous findings and organize issues by severity, useful tests, and open questions. Do not present guesses as reproduced bugs.",
      ],
    ],
  },
  documentCleanup: {
    zh: [
      [
        "盘点文档",
        "检查项目文档的重复、过期信息和断链，列出需要整理的具体文件与原因。不要删除用户资料。",
      ],
      ["整理文档", "依据上一步清单修正明确的文档问题，保留事实依据；汇报改动和无法核实的内容。"],
    ],
    en: [
      [
        "Inventory documentation",
        "Find duplicate, stale, or broken documentation and identify exact files and reasons. Do not delete user data.",
      ],
      [
        "Clean up documentation",
        "Fix clear issues from the inventory while preserving factual sources. Report changes and anything you could not verify.",
      ],
    ],
  },
} as const;

export function createWorkflowGraph(
  template: WorkflowTemplate,
  language: "zh" | "en" = "zh",
): WorkflowGraph {
  if (template === "blank") return { nodes: [], edges: [] };
  if (template in taskTemplates) {
    const tasks = taskTemplates[template as keyof typeof taskTemplates][language];
    const nodes = [
      makeWorkflowNode("start", { x: 120, y: 220 }),
      ...tasks.map(([label, prompt], index) => {
        const node = makeWorkflowNode("agent", { x: 420 + index * 300, y: 220 }, label);
        node.data.prompt = prompt;
        return node;
      }),
      makeWorkflowNode("end", { x: 420 + tasks.length * 300, y: 220 }),
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
