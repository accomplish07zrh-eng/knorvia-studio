import { STUDIO_OUTPUT_REF_VERSION, type StudioWorkflowDefinition } from "@knorvia/services";
import { isStudioWorkflow, validateWorkflowGraph } from "./graph.js";
import { duplicateWorkflow } from "./workflowDrafts.js";
import type { StudioWorkflow } from "./types.js";

export const WORKFLOW_FILE_LIMIT = 8 * 1024 * 1024;
/**
 * 信封版本。2 起节点 `data` 可携带契约版本字段（`version`）；
 * 1 仍然可导入，旧文件不需要迁移。
 */
export const WORKFLOW_FILE_VERSION = 2;
/** 节点 `data` 允许出现的键；闭合白名单，未知键一律报 fileInvalid。 */
const NODE_DATA_KEYS = [
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
  "version",
] as const;
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
      version: WORKFLOW_FILE_VERSION,
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
            // 定义契约版本必须随文件往返，否则导入会静默丢字段。
            ...(data.version === undefined ? {} : { version: data.version }),
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
  if (value.version !== 1 && value.version !== WORKFLOW_FILE_VERSION)
    throw new WorkflowFileError("fileVersion");
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
      !keys(node.data, [...NODE_DATA_KEYS]) ||
      (node.data.version !== undefined &&
        (!Number.isSafeInteger(node.data.version) || (node.data.version as number) < 0))
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
  const version = candidate.version;
  // 高于本进程的定义版本按 fileVersion 明确拒绝，不按当前语义继续，也不静默降级。
  if (
    version !== undefined &&
    (!Number.isSafeInteger(version) ||
      (version as number) < 0 ||
      (version as number) > STUDIO_OUTPUT_REF_VERSION)
  )
    throw new WorkflowFileError("fileVersion");
  const definition: StudioWorkflowDefinition = {
    id: "import",
    name: candidate.name as string,
    workspacePath,
    workspaceMode: "isolated",
    updatedAt: Date.now(),
    // 节点与边已按上方的闭合白名单逐项校验过；类型收窄由 isStudioWorkflow 复查。
    nodes: candidate.nodes as StudioWorkflowDefinition["nodes"],
    edges: candidate.edges as StudioWorkflowDefinition["edges"],
    ...(version === undefined ? {} : { version: version as number }),
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
