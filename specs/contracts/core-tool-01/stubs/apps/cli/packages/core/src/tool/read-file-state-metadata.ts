// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

function notImplemented(name: string): never {
  throw new Error("not implemented: core-tool-01: " + name);
}

export type PersistedReadFileStateTool = "Read" | "Write" | "Edit";

export interface PersistedReadFileStateMetadata {
  schemaVersion: typeof READ_FILE_STATE_METADATA_SCHEMA_VERSION;
  tool: PersistedReadFileStateTool;
  path: string;
  content: string;
  offset?: number;
  limit?: number;
  isPartialView: boolean;
  readAtMs: number;
  revisionId: string;
  mtimeMs: number;
  sizeBytes: number;
}

export const READ_FILE_STATE_METADATA_SCHEMA_VERSION = notImplemented(
  "READ_FILE_STATE_METADATA_SCHEMA_VERSION",
);

export function parseReadFileStateMetadata(
  metadata: unknown,
): PersistedReadFileStateMetadata | undefined {
  throw new Error("not implemented: core-tool-01");
}

export function createReadFileStateMetadataFromEntry(input: {
  completedAt: Date;
  entry?: ReadFileStateEntry;
  toolName: PersistedReadFileStateTool;
}): PersistedReadFileStateMetadata | undefined {
  throw new Error("not implemented: core-tool-01");
}

export function createReadFileStateMetadata(input: {
  completedAt: Date;
  output: unknown;
  readFileState?: ReadFileStateMap;
  toolInput: unknown;
  toolName: string;
}): PersistedReadFileStateMetadata | undefined {
  throw new Error("not implemented: core-tool-01");
}
