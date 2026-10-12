// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

function notImplemented(name: string): never {
  throw new Error("not implemented: core-tool-01: " + name);
}

export const WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES = notImplemented(
  "WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES",
);

export const WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES = notImplemented(
  "WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES",
);

export function formatPublishedArtifactLine(artifact: PublishedArtifactSummary): string {
  throw new Error("not implemented: core-tool-01");
}

export function buildWorkflowArtifactsNotificationSection(
  artifacts: readonly PublishedArtifactSummary[] | undefined,
  maxLines: number,
): WorkflowArtifactsNotificationSection | undefined {
  throw new Error("not implemented: core-tool-01");
}

export function buildWorkflowArtifactsManifestSection(
  artifacts: readonly PublishedArtifactSummary[] | undefined,
): { artifacts: WorkflowArtifactManifestEntry[]; artifactsTruncated?: true } | undefined {
  throw new Error("not implemented: core-tool-01");
}

export function toPublishedArtifactSummaries(
  value: unknown,
): PublishedArtifactSummary[] | undefined {
  throw new Error("not implemented: core-tool-01");
}
