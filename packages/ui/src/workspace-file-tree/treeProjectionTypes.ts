// SPDX-License-Identifier: Apache-2.0
// Source-exposed compatibility shapes; authorship and license review remain pending.
import type { FileEntry } from "@knorvia/shared";

export interface WorkspaceFileTreeNode {
  path: string;
  name: string;
  type: FileEntry["type"];
  depth: number;
  isSymbolicLink?: boolean;
}

export interface WorkspaceFileTreeRow extends WorkspaceFileTreeNode {
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  error: Error | null;
  compactedPaths?: string[];
}

export type WorkspaceFileGitStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "ignored";
