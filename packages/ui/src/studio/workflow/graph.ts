import { isStudioKernelId } from "../types.js";
import { STUDIO_WORKFLOW_NODE_KINDS, validateStudioWorkflow } from "@knorvia/services";
import { workflowDefinition } from "./workflowDrafts.js";
import {
  WORKFLOW_LIMITS,
  type StudioWorkflow,
  type WorkflowGraph,
  type WorkflowIssue,
} from "./types.js";

/** Pure definition validation. It never interprets conditions or executes a node. */
export function validateWorkflowGraph({ nodes, edges }: WorkflowGraph): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  if (nodes.length > WORKFLOW_LIMITS.nodes || edges.length > WORKFLOW_LIMITS.edges)
    issues.push({ code: "sizeLimit" });
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const edgePairs = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) issues.push({ code: "duplicateNode", nodeId: node.id });
    nodeIds.add(node.id);
  }
  if (nodes.filter((node) => node.data.kind === "start").length !== 1)
    issues.push({ code: "oneStart" });
  if (!nodes.some((node) => node.data.kind === "end")) issues.push({ code: "needEnd" });
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) issues.push({ code: "duplicateEdge", edgeId: edge.id });
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ code: "missingNode", edgeId: edge.id });
      continue;
    }
    const pair = JSON.stringify([edge.source, edge.target, edge.sourceHandle ?? null]);
    if (edgePairs.has(pair)) issues.push({ code: "duplicateEdge", edgeId: edge.id });
    edgePairs.add(pair);
    if (edge.source === edge.target)
      issues.push({ code: "selfLink", nodeId: edge.source, edgeId: edge.id });
    incoming.get(edge.target)!.push(edge.source);
    outgoing.get(edge.source)!.push(edge.target);
  }
  for (const node of nodes) {
    const inCount = incoming.get(node.id)!.length;
    const outCount = outgoing.get(node.id)!.length;
    const issue = (code: string) => issues.push({ code, nodeId: node.id });
    if (node.data.kind === "start") {
      if (inCount) issue("startIncoming");
      if (outCount !== 1) issue("oneOutput");
    } else if (!inCount) issue("noInput");
    if (node.data.kind === "end") {
      if (outCount) issue("endOutgoing");
    } else if (node.data.kind === "condition") {
      const branches = edges.filter((edge) => edge.source === node.id);
      if (
        branches.length !== 2 ||
        branches.filter((edge) => edge.sourceHandle === "yes").length !== 1 ||
        branches.filter((edge) => edge.sourceHandle === "no").length !== 1
      )
        issue("conditionBranches");
      if (!node.data.condition.trim()) issue("conditionRequired");
    } else if (node.data.kind === "parallel") {
      if (new Set(outgoing.get(node.id)).size < 2) issue("parallelBranches");
    } else if (node.data.kind !== "start" && outCount !== 1) issue("oneOutput");
    if (node.data.kind === "join" && inCount < 2) issue("joinInputs");
    if (node.data.kind === "agent") {
      if (!node.data.prompt.trim()) issue("promptRequired");
      if (!isStudioKernelId(node.data.kernel)) issue("kernelRequired");
    }
    if (node.data.kind === "creation") {
      if (!node.data.prompt.trim()) issue("promptRequired");
      if (!node.data.creationModelId) issue("creationModelRequired");
    }
    if (node.data.kind === "approval" && !node.data.prompt.trim()) issue("approvalRequired");
    if (
      !Number.isInteger(node.data.retryCount) ||
      node.data.retryCount < 0 ||
      node.data.retryCount > 5 ||
      !Number.isInteger(node.data.retryDelay) ||
      node.data.retryDelay < 0 ||
      node.data.retryDelay > 3600
    )
      issue("invalidRetry");
  }
  // 拓扑遍历避免深图递归溢出；循环不能用执行时重试伪装为合法流程。
  const degrees = new Map([...incoming].map(([id, sources]) => [id, sources.length]));
  const queue = nodes.filter((node) => degrees.get(node.id) === 0).map((node) => node.id);
  let visited = 0;
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    visited++;
    for (const target of outgoing.get(id) ?? []) {
      degrees.set(target, degrees.get(target)! - 1);
      if (degrees.get(target) === 0) queue.push(target);
    }
  }
  if (visited !== nodes.length)
    issues.push({
      code: "cycle",
      nodeId: nodes.find((node) => (degrees.get(node.id) ?? 0) > 0)?.id,
    });
  const visit = (roots: string[], links: Map<string, string[]>) => {
    const seen = new Set(roots);
    const pending = [...roots];
    for (let index = 0; index < pending.length; index++)
      for (const next of links.get(pending[index]!) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          pending.push(next);
        }
      }
    return seen;
  };
  const reachable = visit(
    nodes.filter((node) => node.data.kind === "start").map((node) => node.id),
    outgoing,
  );
  const finishing = visit(
    nodes.filter((node) => node.data.kind === "end").map((node) => node.id),
    incoming,
  );
  for (const node of nodes) {
    if (!reachable.has(node.id)) issues.push({ code: "unreachable", nodeId: node.id });
    if (!finishing.has(node.id)) issues.push({ code: "noEndPath", nodeId: node.id });
  }
  if (!issues.length) {
    // 编辑器与执行器共用公开纯校验，不能把非法表达式或非前置引用显示成检查通过。
    for (const detail of validateStudioWorkflow(
      workflowDefinition({
        nodes,
        edges,
        id: "validation",
        name: "Workflow",
        workspacePath: "",
        updatedAt: 0,
      }),
    )) {
      const node = nodes.find((item) => detail.includes(item.id));
      issues.push({
        code: detail.includes("non-ancestor")
          ? "invalidReference"
          : node?.data.kind === "condition"
            ? "invalidCondition"
            : "invalidDefinition",
        nodeId: node?.id,
      });
    }
  }
  return issues;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function shortString(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.length <= max;
}

/** Storage is untrusted; reject unknown versions in the store instead of rewriting them. */
export function isStudioWorkflow(value: unknown, legacy = false): value is StudioWorkflow {
  if (
    !record(value) ||
    !shortString(value.id) ||
    !value.id ||
    !shortString(value.name, legacy ? 120 : WORKFLOW_LIMITS.name) ||
    !value.name.trim() ||
    !shortString(value.workspacePath, 4000) ||
    (value.workspaceMode !== undefined &&
      !["isolated", "shared"].includes(value.workspaceMode as string)) ||
    !Number.isFinite(value.updatedAt) ||
    (value.version !== undefined &&
      (!Number.isSafeInteger(value.version) || (value.version as number) < 0))
  )
    return false;
  if (
    !Array.isArray(value.nodes) ||
    value.nodes.length > (legacy ? 300 : WORKFLOW_LIMITS.nodes) ||
    !Array.isArray(value.edges) ||
    value.edges.length > (legacy ? 1000 : WORKFLOW_LIMITS.edges)
  )
    return false;
  const ids = new Set<string>();
  for (const node of value.nodes) {
    if (
      !record(node) ||
      !shortString(node.id, 200) ||
      !node.id ||
      ["input", "output", "__proto__", "constructor", "prototype"].includes(node.id) ||
      ids.has(node.id) ||
      node.type !== "studio" ||
      !record(node.position) ||
      !Number.isFinite(node.position.x) ||
      !Number.isFinite(node.position.y) ||
      !record(node.data)
    )
      return false;
    ids.add(node.id);
    const data = node.data;
    if (
      !STUDIO_WORKFLOW_NODE_KINDS.includes(data.kind as never) ||
      !shortString(data.label, 120) ||
      !isStudioKernelId(data.kernel) ||
      !shortString(data.prompt, 20000) ||
      !shortString(data.condition, 2000) ||
      (data.creationModelId !== undefined && !shortString(data.creationModelId, 100)) ||
      (data.creationReferencePath !== undefined &&
        !shortString(data.creationReferencePath, 2048)) ||
      !Number.isInteger(data.retryCount) ||
      (data.retryCount as number) < 0 ||
      (data.retryCount as number) > 5 ||
      !Number.isInteger(data.retryDelay) ||
      (data.retryDelay as number) < 0 ||
      (data.retryDelay as number) > 3600 ||
      !["all", "any"].includes(data.joinPolicy as string)
    )
      return false;
  }
  const edgeIds = new Set<string>();
  for (const edge of value.edges) {
    if (
      !record(edge) ||
      !shortString(edge.id, 200) ||
      !edge.id ||
      edgeIds.has(edge.id) ||
      !shortString(edge.source) ||
      !shortString(edge.target) ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      (edge.sourceHandle !== undefined &&
        edge.sourceHandle !== null &&
        !shortString(edge.sourceHandle)) ||
      (edge.targetHandle !== undefined &&
        edge.targetHandle !== null &&
        !shortString(edge.targetHandle))
    )
      return false;
    edgeIds.add(edge.id);
  }
  return true;
}
