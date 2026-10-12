// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export const createStructuredPatch = ({
  filePath,
  newContent,
  oldContent,
}: {
  filePath: string;
  newContent: string;
  oldContent: string;
}): DiffHunk[] => {
  throw new Error("not implemented: core-tool-01");
};

export const countPatchLines = (
  structuredPatch: DiffHunk[],
): { additions: number; deletions: number } => {
  throw new Error("not implemented: core-tool-01");
};
