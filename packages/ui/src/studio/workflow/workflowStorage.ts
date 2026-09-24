import type { WorkflowGraph } from "./types.js";

export function graphCopy(graph: WorkflowGraph): WorkflowGraph {
  return {
    nodes: graph.nodes.map(({ id, type, position, data }) => ({
      id,
      type,
      position: { ...position },
      data: { ...data },
    })),
    edges: graph.edges.map(({ id, source, target, sourceHandle, targetHandle, type }) => ({
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
      type: type ?? "smoothstep",
    })),
  };
}

function entries(value: unknown): [string, unknown][] {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.entries(value)
    : [];
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}
export function workflowStorageMetadata(value: Record<string, unknown>) {
  return {
    importedIds: strings(value.importedIds),
    observedIds: strings(value.observedIds),
    backendVersions: Object.fromEntries(
      entries(value.backendVersions).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    backendRevisions: Object.fromEntries(
      entries(value.backendRevisions).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isSafeInteger(entry[1]) && entry[1] >= 0,
      ),
    ),
    inputDrafts: Object.fromEntries(
      entries(value.inputDrafts).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && entry[1].length <= 32000,
      ),
    ),
  };
}
