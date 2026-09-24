import { isStudioWorkflow, validateWorkflowGraph } from "./graph.js";
import { duplicateWorkflow } from "./workflowDrafts.js";
import type { StudioWorkflow } from "./types.js";

export const WORKFLOW_FILE_LIMIT = 8 * 1024 * 1024;
export class WorkflowFileError extends Error {
  constructor(readonly code: "fileTooLarge" | "fileInvalid" | "fileVersion") {
    super(code);
  }
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

/** File envelopes contain only portable definitions, never host paths, runs or model credentials. */
export function encodeWorkflowFile(workflow: StudioWorkflow): string {
  const text = JSON.stringify(
    {
      format: "knorvia-workflow",
      version: 1,
      workflow: {
        name: workflow.name,
        nodes: workflow.nodes.map(({ id, position, data }) => ({
          id,
          type: "studio",
          position: { x: position.x, y: position.y },
          data: {
            kind: data.kind,
            label: data.label,
            kernel: data.kernel,
            prompt: data.prompt,
            condition: data.condition,
            retryCount: data.retryCount,
            retryDelay: data.retryDelay,
            joinPolicy: data.joinPolicy,
            ...(data.kind === "creation"
              ? {
                  creationModelId: data.creationModelId ?? "",
                  creationReferencePath: data.creationReferencePath ?? "",
                }
              : {}),
          },
        })),
        edges: workflow.edges.map(({ id, source, target, sourceHandle }) => ({
          id,
          source,
          target,
          sourceHandle: sourceHandle === "out" ? null : (sourceHandle ?? null),
          targetHandle: null,
          type: "smoothstep",
        })),
      },
    },
    null,
    2,
  );
  if (new TextEncoder().encode(text).byteLength > WORKFLOW_FILE_LIMIT)
    throw new WorkflowFileError("fileTooLarge");
  return text;
}

export function decodeWorkflowFile(text: string, workspacePath = "") {
  if (new TextEncoder().encode(text).byteLength > WORKFLOW_FILE_LIMIT)
    throw new WorkflowFileError("fileTooLarge");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new WorkflowFileError("fileInvalid");
  }
  if (!plain(value) || value.format !== "knorvia-workflow")
    throw new WorkflowFileError("fileInvalid");
  if (value.version !== 1) throw new WorkflowFileError("fileVersion");
  if (!keys(value, ["format", "version", "workflow"]) || !plain(value.workflow))
    throw new WorkflowFileError("fileInvalid");
  const candidate = value.workflow;
  if (
    !keys(candidate, ["name", "nodes", "edges"]) ||
    !Array.isArray(candidate.nodes) ||
    !Array.isArray(candidate.edges)
  )
    throw new WorkflowFileError("fileInvalid");
  for (const node of candidate.nodes) {
    if (
      !plain(node) ||
      !keys(node, ["id", "type", "position", "data"]) ||
      !plain(node.position) ||
      !keys(node.position, ["x", "y"]) ||
      typeof node.position.x !== "number" ||
      Math.abs(node.position.x) > 1_000_000 ||
      typeof node.position.y !== "number" ||
      Math.abs(node.position.y) > 1_000_000 ||
      !plain(node.data) ||
      !keys(node.data, [
        "kind",
        "label",
        "kernel",
        "prompt",
        "condition",
        "retryCount",
        "retryDelay",
        "joinPolicy",
        "creationModelId",
        "creationReferencePath",
      ])
    )
      throw new WorkflowFileError("fileInvalid");
  }
  for (const edge of candidate.edges) {
    if (
      !plain(edge) ||
      !keys(edge, ["id", "source", "target", "sourceHandle", "targetHandle", "type"]) ||
      (edge.type !== undefined && edge.type !== "smoothstep") ||
      (edge.sourceHandle != null && !["yes", "no", "out"].includes(edge.sourceHandle as string)) ||
      (edge.targetHandle != null && edge.targetHandle !== "in")
    )
      throw new WorkflowFileError("fileInvalid");
  }
  const definition = {
    ...candidate,
    id: "import",
    workspacePath,
    workspaceMode: "isolated",
    updatedAt: Date.now(),
  };
  if (!isStudioWorkflow(definition)) throw new WorkflowFileError("fileInvalid");
  // 导入永远建立新身份，避免覆盖本机同名流程；前置节点引用随节点 ID 一起重写。
  const workflow = duplicateWorkflow(definition, definition.name);
  workflow.edges = workflow.edges.map((edge) => ({
    ...edge,
    sourceHandle: edge.sourceHandle === "out" ? null : edge.sourceHandle,
    targetHandle: null,
  }));
  return { workflow, issues: validateWorkflowGraph(workflow) };
}

export function workflowFileName(name: string) {
  let base =
    Array.from(name, (character) => (character.charCodeAt(0) < 32 ? "_" : character))
      .join("")
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 100) || "workflow";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `workflow-${base}`;
  return `${base}.knorvia-workflow.json`;
}
