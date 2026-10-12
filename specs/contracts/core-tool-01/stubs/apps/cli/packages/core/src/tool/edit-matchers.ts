// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export function findEditMatch(input: {
  content: string;
  search: string;
  replaceAll: boolean;
}): EditMatchResult {
  throw new Error("not implemented: core-tool-01");
}

export function normalizeLineEndings(content: string): string {
  throw new Error("not implemented: core-tool-01");
}

export function normalizeReplacementForMatch(
  strategy: EditMatchStrategy,
  newString: string,
): string {
  throw new Error("not implemented: core-tool-01");
}

export function preserveQuoteStyle(
  oldString: string,
  actualOldString: string,
  newString: string,
): string {
  throw new Error("not implemented: core-tool-01");
}
