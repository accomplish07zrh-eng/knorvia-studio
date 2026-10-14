// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export type ToolPathPlatform = NodeJS.Platform;

export type ToolPathApi = typeof path.posix | typeof path.win32;

export function getToolPathApi(platform: ToolPathPlatform): ToolPathApi {
  throw new Error("not implemented: core-tool-01");
}

export function normalizeToolPathForComparison(
  filePath: string,
  platform: ToolPathPlatform = currentPlatform,
): string {
  throw new Error("not implemented: core-tool-01");
}
