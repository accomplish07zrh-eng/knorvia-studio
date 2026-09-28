// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ModelToolContract } from "@knorvia/contracts";
import type { ToolEntry, ToolMetadata } from "../types.js";

const USAGE_HEADING = "Usage:";

function description(metadata: ToolMetadata): string | undefined {
  const introduction = metadata.description;
  const instructions = metadata.modelInstructions?.map((line) => line.trim()).filter(Boolean) ?? [];
  if (!instructions.length) return introduction;
  const paragraphs = [USAGE_HEADING];
  for (const instruction of instructions) paragraphs.push(`- ${instruction}`);
  const usage = paragraphs.join("\n");
  return introduction && introduction.length > 0 ? `${introduction}\n\n${usage}` : usage;
}

function project(entry: ToolEntry): ModelToolContract {
  return {
    name: entry.metadata.name,
    description: description(entry.metadata),
    capability: entry.capability,
    executionMode: entry.executionMode,
    providerNative: entry.providerNative,
    inputSchema: entry.inputSchema,
    outputSchema: entry.outputSchema,
    ...(entry.strict === undefined ? {} : { strict: entry.strict }),
    readOnly: entry.metadata.readOnly,
    destructive: entry.metadata.destructive,
    concurrentSafe: entry.metadata.concurrentSafe,
    requiresUserInteraction:
      entry.requiresUserInteraction ?? entry.metadata.requiresUserInteraction,
    maxOutputBytes: entry.metadata.maxOutputBytes,
    timeoutMs: entry.metadata.timeoutMs,
    needsApproval: entry.metadata.needsApproval,
    sideEffectScope: entry.metadata.sideEffectScope,
    permission: entry.permission,
    resultBudget: entry.resultBudget,
    execute: undefined,
  };
}

export function modelContracts(snapshot: ToolEntry[]): ModelToolContract[] {
  const visible = snapshot.filter((entry) => entry.metadata.providerVisible !== false);
  return visible.map(project);
}
