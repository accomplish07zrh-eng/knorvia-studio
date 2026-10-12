// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export function createReadFileStateKey(
  filePath: string,
  offset: number | undefined,
  limit: number | undefined,
  target: NodeJS.Platform = platform,
): string {
  throw new Error("not implemented: core-tool-01");
}

export function normalizeReadFileStateMtimeMs(value: number | undefined): number | undefined {
  throw new Error("not implemented: core-tool-01");
}

export function findLatestReadFileState(
  states: ReadFileStateMap | undefined,
  filePath: string,
  target: NodeJS.Platform = platform,
): ReadFileStateEntry | undefined {
  throw new Error("not implemented: core-tool-01");
}

export function findEditableReadFileState(
  states: ReadFileStateMap | undefined,
  filePath: string,
  target: NodeJS.Platform = platform,
): ReadFileStateEntry | undefined {
  throw new Error("not implemented: core-tool-01");
}
