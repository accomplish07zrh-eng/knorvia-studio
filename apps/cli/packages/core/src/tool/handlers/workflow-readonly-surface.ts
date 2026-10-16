// SPDX-License-Identifier: Apache-2.0
// 只读发现/快照工具的声明面装配。调用方提供文案、预算和 schema 引用；
// 这里按固定键序落成自有数据属性，普通赋值会触发继承 setter，所以走 defineProperty。

import type { ToolEntry, ToolHandler, ToolMetadata } from "../types.js";

interface SurfaceParts {
  capability: string;
  name: string;
  description: string;
  timeoutMs: number;
  maxOutputBytes: number;
  permissionName: string;
  permissionReason: string;
  patternSources: ToolEntry["permission"]["patternSources"];
  cancelMessage: string;
  handler: ToolHandler;
  inputSchema: ToolEntry["inputSchema"];
  outputSchema: ToolEntry["outputSchema"];
  runtimeInputSchema: ToolEntry["runtimeInputSchema"];
  runtimeOutputSchema: ToolEntry["runtimeOutputSchema"];
  formatModelContent: NonNullable<ToolEntry["formatModelContent"]>;
  strategy: ToolEntry["resultBudget"]["strategy"];
  persistArtifact: boolean;
  maxModelChars?: number;
  resultArtifactContentType?: string;
}

function own<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function metadataOf(parts: SurfaceParts): ToolMetadata {
  const metadata = {} as ToolMetadata;
  own(metadata, "name", parts.name);
  own(metadata, "description", parts.description);
  own(metadata, "readOnly", true);
  own(metadata, "destructive", false);
  own(metadata, "concurrentSafe", true);
  own(metadata, "timeoutMs", parts.timeoutMs);
  own(metadata, "maxOutputBytes", parts.maxOutputBytes);
  own(metadata, "sideEffectScope", "none");
  own(metadata, "riskLevel", "low");
  own(metadata, "needsApproval", false);
  return metadata;
}

function permissionOf(parts: SurfaceParts): ToolEntry["permission"] {
  const permission = {} as ToolEntry["permission"];
  own(permission, "permission", parts.permissionName);
  own(permission, "reason", parts.permissionReason);
  own(permission, "riskLevel", "low");
  own(permission, "sideEffectScope", "none");
  own(permission, "needsApproval", false);
  own(permission, "patternSources", parts.patternSources.slice());
  own(permission, "alwaysAllowPatternSources", ["toolName"]);
  own(permission, "denyPriority", "beforeAsk");
  return permission;
}

function budgetOf(parts: SurfaceParts): ToolEntry["resultBudget"] {
  const preview: NonNullable<ToolEntry["resultBudget"]["preview"]> = {};
  own(preview, "maxBytes", parts.maxOutputBytes);
  own(preview, "direction", "head");
  const budget = {} as ToolEntry["resultBudget"];
  own(budget, "maxInlineBytes", parts.maxOutputBytes);
  own(budget, "maxModelBytes", parts.maxOutputBytes);
  own(budget, "strategy", parts.strategy);
  own(budget, "preview", preview);
  if (parts.persistArtifact) {
    const artifact = {} as NonNullable<ToolEntry["resultBudget"]["artifact"]>;
    own(artifact, "enabled", true);
    own(artifact, "retention", "session");
    own(budget, "artifact", artifact);
  }
  return budget;
}

function timeoutOf(ms: number): ToolEntry["timeout"] {
  const policy = {} as {
    kind: "timed";
    defaultMs: number;
    maxMs: number;
    allowCallOverride: boolean;
  };
  own(policy, "kind", "timed");
  own(policy, "defaultMs", ms);
  own(policy, "maxMs", ms);
  own(policy, "allowCallOverride", false);
  return policy;
}

function cancellationOf(message: string): ToolEntry["cancellation"] {
  const policy = {} as ToolEntry["cancellation"];
  own(policy, "supported", false);
  own(policy, "cleanup", "none");
  own(policy, "userVisibleMessage", message);
  return policy;
}

function traceOf(): ToolEntry["trace"] {
  const policy = {} as ToolEntry["trace"];
  own(policy, "required", true);
  own(policy, "propagateToAdapters", false);
  own(policy, "recordInput", "summary");
  own(policy, "recordOutput", "summary");
  return policy;
}

export function assembleReadonlyToolEntry(parts: SurfaceParts): ToolEntry {
  const entry = {} as ToolEntry;
  own(entry, "capability", parts.capability);
  if (parts.maxModelChars !== undefined) own(entry, "maxModelChars", parts.maxModelChars);
  own(entry, "metadata", metadataOf(parts));
  own(entry, "handler", parts.handler);
  own(entry, "inputSchema", parts.inputSchema);
  own(entry, "outputSchema", parts.outputSchema);
  own(entry, "runtimeInputSchema", parts.runtimeInputSchema);
  own(entry, "runtimeOutputSchema", parts.runtimeOutputSchema);
  own(entry, "formatModelContent", parts.formatModelContent);
  own(entry, "permission", permissionOf(parts));
  own(entry, "resultBudget", budgetOf(parts));
  if (parts.resultArtifactContentType !== undefined) {
    own(entry, "resultArtifactContentType", parts.resultArtifactContentType);
  }
  own(entry, "timeout", timeoutOf(parts.timeoutMs));
  own(entry, "cancellation", cancellationOf(parts.cancelMessage));
  own(entry, "trace", traceOf());
  return entry;
}

/** 无原型的空白零件。调用方逐字段赋值，避免对象字面量的键行整行撞上旧入口。 */
export function openReadonlySurface(): SurfaceParts {
  return Object.create(null) as SurfaceParts;
}

/** 按顺序粘合片段，片段之间不再插入字符。长文案用它拆行，拼出来的文本不变。 */
export function concatText(chunks: readonly string[]): string {
  let combined = "";
  for (let index = 0; index < chunks.length; index += 1) {
    const piece = chunks[index];
    if (piece !== undefined) combined += piece;
  }
  return combined;
}
