import {
  WORKFLOW_ARTIFACT_LIMITS,
  type WorkflowRunArtifactKind,
  type WorkflowRunArtifactSummary,
} from "./workflow-artifacts.js";

export function workflowArtifactSummary(value: unknown): WorkflowRunArtifactSummary | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const artifact = value as Record<string, unknown>;
  const id = artifact.id;
  const kind = artifact.kind;
  const version = artifact.version;

  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof kind !== "string" ||
    kind.length === 0 ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return undefined;
  }

  if (
    kind !== "file" &&
    kind !== "markdown" &&
    kind !== "chart" &&
    kind !== "table" &&
    kind !== "metrics" &&
    kind !== "board"
  ) {
    return undefined;
  }

  const title = artifact.title;
  const contentType = artifact.contentType;
  const bytes = artifact.bytes;
  const artifactKind: WorkflowRunArtifactKind = kind;

  return {
    id: id.slice(0, WORKFLOW_ARTIFACT_LIMITS.maxIdLength),
    kind: artifactKind,
    ...(typeof title === "string" && title.length > 0
      ? { title: title.slice(0, WORKFLOW_ARTIFACT_LIMITS.maxTitleLength) }
      : {}),
    version: Math.min(version, WORKFLOW_ARTIFACT_LIMITS.maxVersions),
    ...(typeof contentType === "string" && contentType.length > 0
      ? { contentType: contentType.slice(0, 128) }
      : {}),
    ...(typeof bytes === "number" && Number.isInteger(bytes) && bytes >= 0 ? { bytes } : {}),
    ...(artifact.primary === true ? { primary: true as const } : {}),
  };
}

export function upsertBoundedByArtifactId(
  list: readonly WorkflowRunArtifactSummary[],
  entry: WorkflowRunArtifactSummary,
  limit: number,
): { list: WorkflowRunArtifactSummary[]; truncated: boolean } {
  const index = list.findIndex((artifact) => artifact.id === entry.id);
  if (index !== -1) {
    const previous = list[index]!;
    const itemCount = previous.itemCount;
    const updated = [...list];
    updated[index] = itemCount !== undefined ? { ...entry, itemCount } : { ...entry };
    return { list: updated, truncated: false };
  }

  if (list.length >= limit) {
    return { list: [...list], truncated: true };
  }

  return { list: [...list, entry], truncated: false };
}

export function countTaggedReport(
  list: readonly WorkflowRunArtifactSummary[] | undefined,
  artifactId: string,
): WorkflowRunArtifactSummary[] | undefined {
  if (list === undefined) {
    return undefined;
  }

  const index = list.findIndex((artifact) => artifact.id === artifactId);
  if (index === -1) {
    return undefined;
  }

  const previous = list[index]!;
  const updated = [...list];
  updated[index] = { ...previous, itemCount: (previous.itemCount ?? 0) + 1 };
  return updated;
}
