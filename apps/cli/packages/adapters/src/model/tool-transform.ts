// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import { jsonSchema, tool, type ToolSet } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelToolContract } from "@knorvia/contracts";
import { isAnthropicFirstPartyModelId, toStrictToolSchema } from "./strict-tool-schema.js";
import { AiSdkModelAdapterError } from "./errors.js";
export interface AiSdkToolTransformOptions {
  requiresMfjsToolSchema?: boolean;
  supportsNativeWebSearch?: boolean;
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom";
  modelId?: string;
}
function normalizeSchema(
  schema: Record<string, unknown>,
  toolName: string,
  requiresMfjs = false,
): Record<string, unknown> {
  if (!requiresMfjs) return schema;
  const resolvePointer = (reference: string): unknown => {
    let current: unknown = schema;
    for (const encoded of reference.slice(2).split("/")) {
      const key = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
      if (typeof current !== "object" || current === null || !(key in current)) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  };
  const visit = (value: unknown, resolving = new Set<string>()): unknown => {
    if (Array.isArray(value)) return value.map((entry) => visit(entry, resolving));
    if (typeof value !== "object" || value === null) return value;
    const record = value as Record<string, unknown>;
    if (typeof record.$ref === "string" && record.$ref.startsWith("#/")) {
      const reference = record.$ref;
      const target = resolvePointer(reference);
      if (target === undefined)
        throw new AiSdkModelAdapterError(
          "invalid_model_request",
          `Tool ${toolName} has an unresolved local schema reference: ${reference}`,
          {
            context: {
              toolName,
              ref: reference,
              reason: "invalid_request",
              retryable: false,
              source: "runtime",
            },
          },
        );
      if (resolving.has(reference)) return { $ref: reference };
      const nextResolving = new Set(resolving).add(reference);
      const resolved = visit(target, nextResolving);
      const siblings = Object.fromEntries(
        Object.entries(record)
          .filter(([key]) => key !== "$ref")
          .map(([key, entry]) => [key, visit(entry, resolving)]),
      );
      return typeof resolved === "object" && resolved !== null && !Array.isArray(resolved)
        ? { ...(resolved as Record<string, unknown>), ...siblings }
        : Object.keys(siblings).length
          ? { allOf: [resolved], ...siblings }
          : resolved;
    }
    return Object.fromEntries(
      Object.entries(record)
        .filter(([key]) => key !== "$defs" && key !== "definitions")
        .map(([key, entry]) => [key, visit(entry, resolving)]),
    );
  };
  return visit(schema) as Record<string, unknown>;
}
export function toAiSdkTools(
  tools?: ModelToolContract[],
  options: AiSdkToolTransformOptions = {},
): ToolSet | undefined {
  if (!tools?.length) return undefined;
  const output: ToolSet = {};
  for (const contract of tools) {
    if (contract.providerNative) {
      if (options.providerKind !== "anthropic" || !options.supportsNativeWebSearch)
        throw new AiSdkModelAdapterError(
          "invalid_model_request",
          "Native web search is not supported by this model",
          { context: { reason: "invalid_request", retryable: false } },
        );
      output[contract.name] = anthropic.tools.webSearch_20260209(
        contract.providerNative.args as never,
      ) as never;
      continue;
    }
    const baseSchema = normalizeSchema(
      contract.inputSchema,
      contract.name,
      options.requiresMfjsToolSchema,
    );
    const strict =
      contract.strict &&
      options.providerKind === "anthropic" &&
      isAnthropicFirstPartyModelId(options.modelId)
        ? toStrictToolSchema(baseSchema)
        : undefined;
    output[contract.name] = tool({
      description: contract.description,
      inputSchema: jsonSchema(strict ?? baseSchema),
      strict: strict ? true : undefined,
      execute: contract.execute
        ? async (input: unknown, context: { toolCallId: string; abortSignal?: AbortSignal }) =>
            contract.execute!(input, {
              toolCallId: context.toolCallId,
              abortSignal: context.abortSignal,
              metadata: {
                readOnly: contract.readOnly,
                destructive: contract.destructive,
                concurrentSafe: contract.concurrentSafe,
                requiresUserInteraction: contract.requiresUserInteraction,
                sideEffectScope: contract.sideEffectScope,
                maxOutputBytes: contract.maxOutputBytes,
                timeoutMs: contract.timeoutMs,
                needsApproval: contract.needsApproval,
                permission: contract.permission,
                resultBudget: contract.resultBudget,
              },
            })
        : undefined,
    } as never);
  }
  return output;
}
