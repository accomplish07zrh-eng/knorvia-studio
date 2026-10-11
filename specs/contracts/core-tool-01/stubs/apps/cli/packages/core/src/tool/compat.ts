// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

function notImplemented(name: string): never {
  throw new Error("not implemented: core-tool-01: " + name);
}

export const TASK_TOOL_NAME = notImplemented("TASK_TOOL_NAME");

export function isSubagentDispatchToolName(toolName: string | undefined): boolean {
  throw new Error("not implemented: core-tool-01");
}

export function hookMatcherToolNamesForTool(toolName: string): readonly string[] {
  throw new Error("not implemented: core-tool-01");
}
