// SPDX-License-Identifier: Apache-2.0

import type { WorkspaceFileEntry } from "./protocol.js";

export interface WorkspaceFileSearchCandidate {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  type: WorkspaceFileEntry["type"];
  lowercaseName: string;
  lowercaseRelativePath: string;
  lowercasePath: string;
}

export interface FilterWorkspaceFileSearchCandidatesOptions {
  limit?: number;
  requireQuery?: boolean;
}
