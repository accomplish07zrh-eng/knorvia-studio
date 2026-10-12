// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export function resolveWorkspacePath(options: ToolWorkspacePathOptions): string {
  throw new Error("not implemented: core-tool-01");
}

export function resolveToolWorkingDirectory(
  inputCwd: string | undefined,
  options: Omit<ToolWorkspacePathOptions, "inputPath">,
): string {
  throw new Error("not implemented: core-tool-01");
}
