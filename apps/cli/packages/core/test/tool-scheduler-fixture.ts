// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolCallId } from "@knorvia/contracts";
import type { ToolDependency } from "../src/tool/scheduler.js";

export const id = (value: string) => value as ToolCallId;
export function dependency(
  name: string,
  parents: string[] = [],
  fields: Partial<ToolDependency> = {},
): ToolDependency {
  return { toolCallId: id(name), dependsOn: parents.map(id), ...fields };
}
