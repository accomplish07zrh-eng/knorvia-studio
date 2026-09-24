import type { StudioWorkflowDefinition } from "@knorvia/services";
import { WORKFLOW_LIMITS, type StudioWorkflow } from "./types.js";

export function workflowDefinition(workflow: StudioWorkflow): StudioWorkflowDefinition {
  return {
    id: workflow.id,
    name: workflow.name,
    workspacePath: workflow.workspacePath || null,
    workspaceMode: workflow.workspaceMode ?? "isolated",
    updatedAt: workflow.updatedAt,
    nodes: workflow.nodes.map(({ id, position, data }) => {
      const { executionState: _state, ...definition } = data;
      return { id, type: "studio", position: { ...position }, data: definition };
    }),
    edges: workflow.edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
      type: "smoothstep",
    })),
  };
}
export function workflowDraft(definition: StudioWorkflowDefinition): StudioWorkflow {
  return {
    ...definition,
    workspacePath: definition.workspacePath ?? "",
    nodes: definition.nodes.map((node) => ({ ...node, type: "studio" })),
    edges: definition.edges.map((edge) => ({ ...edge, type: "smoothstep" })),
  };
}
export function workflowFingerprint(workflow: StudioWorkflow): string {
  return JSON.stringify({ ...workflowDefinition(workflow), updatedAt: 0 });
}
export function workflowFitsRuntime(workflow: StudioWorkflow): boolean {
  return (
    workflow.name.length <= WORKFLOW_LIMITS.name &&
    workflow.nodes.length <= WORKFLOW_LIMITS.nodes &&
    workflow.edges.length <= WORKFLOW_LIMITS.edges
  );
}
/** Only clean drafts follow backend refresh. Unacknowledged edits never disappear. */
export function mergeWorkflowDefinitions(
  drafts: StudioWorkflow[],
  baseline: Record<string, string>,
  definitions: StudioWorkflow[],
  acknowledgement: Record<string, number> = {},
  observedIds: string[] = [],
  revision = Number.POSITIVE_INFINITY,
) {
  const versions = { ...baseline };
  const incoming = new Map(definitions.map((definition) => [definition.id, definition]));
  const workflows = drafts.flatMap((draft) => {
    const definition = incoming.get(draft.id);
    incoming.delete(draft.id);
    const clean = baseline[draft.id] === workflowFingerprint(draft);
    // ACK 先于刷新返回，旧快照不能复活已删除定义或抹掉刚保存的内容。
    if ((acknowledgement[draft.id] ?? 0) > revision) return [draft];
    if (!definition) return observedIds.includes(draft.id) && clean ? [] : [draft];
    if (clean && definition.updatedAt < draft.updatedAt) return draft;
    versions[draft.id] = workflowFingerprint(definition);
    return [clean ? definition : draft];
  });
  for (const definition of incoming.values()) {
    if ((acknowledgement[definition.id] ?? 0) > revision) continue;
    versions[definition.id] = workflowFingerprint(definition);
    workflows.push(definition);
  }
  return { workflows, backendVersions: versions };
}

export function duplicateWorkflow(workflow: StudioWorkflow, name: string): StudioWorkflow {
  const ids = new Map(workflow.nodes.map((node) => [node.id, crypto.randomUUID()]));
  const rewrite = (value: string) =>
    value.replace(/\{\{([^{}]+)\}\}/g, (match, id: string) =>
      ids.has(id.trim()) ? `{{${ids.get(id.trim())}}}` : match,
    );
  return {
    ...workflow,
    id: crypto.randomUUID(),
    name: name.slice(0, WORKFLOW_LIMITS.name),
    updatedAt: Date.now(),
    nodes: workflow.nodes.map((node) => ({
      ...node,
      id: ids.get(node.id)!,
      position: { ...node.position },
      data: {
        ...node.data,
        prompt: rewrite(node.data.prompt),
        condition: rewrite(node.data.condition),
      },
    })),
    edges: workflow.edges.map((edge) => ({
      ...edge,
      id: crypto.randomUUID(),
      source: ids.get(edge.source)!,
      target: ids.get(edge.target)!,
    })),
  };
}
