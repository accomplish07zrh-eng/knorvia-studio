// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export function normalizeToolNameAlias(toolName: string): string {
  throw new Error("not implemented: core-tool-01");
}

export function createToolRuleNameSet(
  rules: readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  throw new Error("not implemented: core-tool-01");
}

export function isToolNameDisallowed(
  toolName: string,
  disallowedTools: readonly string[] | undefined,
): boolean {
  throw new Error("not implemented: core-tool-01");
}

export function filterDisallowedToolNames(
  toolNames: readonly string[],
  disallowedTools: readonly string[] | undefined,
): readonly string[] {
  throw new Error("not implemented: core-tool-01");
}
