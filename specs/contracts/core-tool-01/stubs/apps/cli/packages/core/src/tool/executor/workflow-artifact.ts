// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export { serializeWorkflowArtifact };

export function buildWorkflowReportsNotificationSection(
  items: readonly unknown[] | undefined,
): WorkflowReportsNotificationSection | undefined {
  throw new Error("not implemented: core-tool-01");
}

export function buildWorkflowReportsManifestSection(
  items: readonly unknown[] | undefined,
): { count: number; shown: number; preview: string[] } | undefined {
  throw new Error("not implemented: core-tool-01");
}
