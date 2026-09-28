// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { FileHandle, rename } from "node:fs/promises";
import type { WorkspaceHookTrustRecord } from "@knorvia/contracts";

export type WorkspaceHookTrustStoreLoadResult =
  | { status: "missing"; records: [] }
  | { status: "ok"; records: WorkspaceHookTrustRecord[] }
  | { status: "corrupt"; records: []; recoveredCorruptPath: string };

export interface FileWorkspaceHookTrustStoreOptions {
  filePath: string;
  now?: () => number;
  lockTimeoutMs?: number;
  staleLockMs?: number;
  beforeRename?: () => void | Promise<void>;
  renameFile?: typeof rename;
  renameRetryDelaysMs?: readonly number[];
  probeProcessStartTime?: (pid: number) => Promise<number | null>;
  writeLockOwnerMetadata?: (handle: FileHandle, content: string) => Promise<void>;
}

export interface WorkspaceHookTrustStoreCompactOptions {
  current: Array<{ workspaceIdentity: string; hookDeclarationDigest: string }>;
  maxAgeMs: number;
  maxRecords: number;
  now?: number;
}

export interface WorkspaceHookTrustStoreRevokeOptions {
  workspaceIdentity: string;
  hookDeclarationDigests?: readonly string[];
}

export interface WorkspaceHookTrustStorePathOptions {
  homeDir?: string;
  userConfigPath?: string;
}
