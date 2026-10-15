// SPDX-License-Identifier: Apache-2.0
// 工具契约 → AI SDK 工具集：provider 原生工具只放行 anthropic 的原生 web 搜索；普通工具按需
// 展开本地 $ref（环保留 $ref、剥 $defs/definitions）并按三条件打 strict。错误文案逐字保持。

import { jsonSchema, tool, type ToolSet } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelToolContract } from "@knorvia/contracts";
import { isAnthropicFirstPartyModelId, toStrictToolSchema } from "./strict-tool-schema.js";
import { AiSdkModelAdapterError } from "./errors.js";

export interface AiSdkToolTransformOptions {
  requiresMfjsToolSchema?: boolean; // 需要展开本地 $ref
  supportsNativeWebSearch?: boolean; // 模型支持原生 web 搜索
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom"; // SDK 种类
  modelId?: string; // 模型 id（strict 三条件之一）
}

function normalizeSchema(schema: Record<string, unknown>, label: string, expandRefs: boolean) {
  if (!expandRefs) return schema;
  const walkPointer = (reference: string): unknown => {
    let cursor: unknown = schema;
    for (const encoded of reference.slice(2).split("/")) {
      const segment = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
      if (typeof cursor !== "object" || cursor === null || !(segment in cursor)) return undefined;
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    return cursor;
  };
  const expandNode = (value: unknown, resolving = new Set<string>()): unknown => {
    if (Array.isArray(value)) {
      const list: unknown[] = [];
      for (const entry of value) list.push(expandNode(entry, resolving));
      return list;
    }
    if (value === null || typeof value !== "object") return value;
    const node = value as Record<string, unknown>;
    const reference =
      typeof node.$ref === "string" && node.$ref.startsWith("#/") ? node.$ref : undefined;
    if (reference !== undefined) return expandReference(reference, node, resolving);
    const rebuilt: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(node)) {
      if (key === "$defs" || key === "definitions") continue;
      rebuilt[key] = expandNode(entry, resolving);
    }
    return rebuilt;
  };
  const expandReference = (
    reference: string,
    node: Record<string, unknown>,
    resolving: Set<string>,
  ): unknown => {
    const target = walkPointer(reference);
    if (target === undefined) throw unresolvedReference(label, reference);
    if (resolving.has(reference)) return { $ref: reference };
    const deeper = new Set(resolving).add(reference);
    const resolved = expandNode(target, deeper);
    const siblings: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(node)) {
      if (key === "$ref") continue;
      siblings[key] = expandNode(entry, resolving);
    }
    const mergeable = typeof resolved === "object" && resolved !== null && !Array.isArray(resolved);
    if (mergeable) return { ...(resolved as Record<string, unknown>), ...siblings };
    const siblingKeys = Object.keys(siblings);
    return siblingKeys.length ? { allOf: [resolved], ...siblings } : resolved;
  };
  return expandNode(schema) as Record<string, unknown>;
}

function unresolvedReference(label: string, reference: string): AiSdkModelAdapterError {
  const context = {
    toolName: label, // 所属工具名
    ref: reference, // 未解析的指针
    reason: "invalid_request", // 固定归因
    retryable: false, // 不可重试
    source: "runtime", // 固定来源
  };
  return new AiSdkModelAdapterError(
    "invalid_model_request",
    `Tool ${label} has an unresolved local schema reference: ${reference}`,
    { context },
  );
}

function nativeTool(contract: ModelToolContract, route: AiSdkToolTransformOptions): unknown {
  const allowed = route.providerKind === "anthropic" && route.supportsNativeWebSearch === true;
  if (!allowed) {
    const context = { reason: "invalid_request", retryable: false }; // 固定归因
    throw new AiSdkModelAdapterError(
      "invalid_model_request",
      "Native web search is not supported by this model",
      { context },
    );
  }
  return anthropic.tools.webSearch_20260209(contract.providerNative!.args as never);
}

export function toAiSdkTools(
  contracts?: ModelToolContract[],
  route: AiSdkToolTransformOptions = {},
): ToolSet | undefined {
  if (!contracts?.length) return undefined;
  const assembled: ToolSet = {};
  for (const contract of contracts) {
    if (contract.providerNative) {
      assembled[contract.name] = nativeTool(contract, route) as never;
      continue;
    }
    const baseSchema = normalizeSchema(
      contract.inputSchema,
      contract.name,
      route.requiresMfjsToolSchema === true,
    );
    const strictEligible =
      contract.strict === true &&
      route.providerKind === "anthropic" &&
      isAnthropicFirstPartyModelId(route.modelId);
    const strict = strictEligible ? toStrictToolSchema(baseSchema) : undefined;
    const metadata = {
      readOnly: contract.readOnly, // 只读标记
      destructive: contract.destructive, // 破坏性标记
      concurrentSafe: contract.concurrentSafe, // 并发安全标记
      requiresUserInteraction: contract.requiresUserInteraction, // 需交互标记
      sideEffectScope: contract.sideEffectScope, // 副作用范围
      maxOutputBytes: contract.maxOutputBytes, // 输出预算
      timeoutMs: contract.timeoutMs, // 工具超时
      needsApproval: contract.needsApproval, // 需审批标记
      permission: contract.permission, // 权限需求
      resultBudget: contract.resultBudget, // 结果预算
    };
    assembled[contract.name] = tool({
      description: contract.description, // 工具说明（提示词面）
      inputSchema: jsonSchema(strict ?? baseSchema), // strict 展开优先
      strict: strict ? true : undefined, // 仅 strict 命中时显式给 true
      execute: contract.execute // 可选执行体：透传调用上下文与元数据
        ? async (input: unknown, context: { toolCallId: string; abortSignal?: AbortSignal }) =>
            contract.execute!(input, {
              toolCallId: context.toolCallId,
              abortSignal: context.abortSignal,
              metadata,
            })
        : undefined,
    } as never);
  }
  return assembled;
}
