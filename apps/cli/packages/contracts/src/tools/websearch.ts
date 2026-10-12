// SPDX-License-Identifier: Apache-2.0
// WebSearch 工具声明：面向 provider 原生搜索（web_search）的包装与契约声明。
// 模型看到的入口与 provider 原生参数是两层：前者多一个 maxUses，后者只带域名过滤。

import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";
import type { ProviderNativeToolSpec, ToolContractDeclaration } from "./contract.js";

// provider 原生请求里一次对话最多允许的搜索次数；模型侧缺省与硬上限都是 8。
const WEB_SEARCH_DEFAULT_MAX_USES = 8;
const WEB_SEARCH_MAX_USES = 8;

// 单个字段的 schema 各自命名：域名过滤的两条规则只差描述文案，用同一个构造函数生成。
const webSearchQueryField = z.string().min(2).describe("The search query to use");
const webSearchDomainsField = (description: string) =>
  z.array(z.string()).optional().describe(description);
const MAX_USES_DESCRIPTION = `Maximum provider-native searches in the internal web_search request, default ${WEB_SEARCH_DEFAULT_MAX_USES}`;
const maxUsesRange = z.number().int().min(1).max(WEB_SEARCH_MAX_USES);
const webSearchMaxUsesField = maxUsesRange.optional().describe(MAX_USES_DESCRIPTION);

// provider 原生输入的字段表：字段先列成普通对象，再交给 z.object 组装。
const providerInputFields = {
  query: webSearchQueryField,
  allowed_domains: webSearchDomainsField("Only include search results from these domains"),
  blocked_domains: webSearchDomainsField("Never include search results from these domains"),
};
const WebSearchProviderInputSchema = z.object(providerInputFields).strict();

export const WebSearchInputSchema = WebSearchProviderInputSchema.extend({
  maxUses: webSearchMaxUsesField,
})
  .strict()
  .refine((input) => !(input.allowed_domains?.length && input.blocked_domains?.length), {
    message: "allowed_domains and blocked_domains cannot both be specified",
    path: ["blocked_domains"],
  });

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

export const WebSearchInputJsonSchema = toToolJsonSchema(WebSearchProviderInputSchema);

export interface WebSearchProviderNativeArgs extends Record<string, unknown> {
  allowedDomains?: string[];
  blockedDomains?: string[];
  maxUses?: number;
}

export function toWebSearchProviderNativeArgs(
  input: WebSearchInput,
  defaults: { maxUses: number },
): WebSearchProviderNativeArgs {
  const nativeArgs: WebSearchProviderNativeArgs = {
    allowedDomains: input.allowed_domains,
    blockedDomains: input.blocked_domains,
    maxUses: input.maxUses ?? defaults.maxUses,
  };
  return nativeArgs;
}

export const WebSearchSourceSchema = z
  .object({
    title: z.string().optional(),
    url: z.string().min(1),
  })
  .strict();

export type WebSearchSource = z.infer<typeof WebSearchSourceSchema>;

export const WebSearchResultItemSchema = z
  .object({
    title: z.string().optional(),
    url: z.string().min(1),
    pageAge: z.string().optional(),
  })
  .strict();

export type WebSearchResultItem = z.infer<typeof WebSearchResultItemSchema>;

// 服务端工具用量是可选的子对象：字段表 + z.object 组装，再挂到用量 schema 上。
const serverToolUseFields = {
  webSearchRequests: z.number().optional(),
  webFetchRequests: z.number().optional(),
};
const serverToolUseField = z.object(serverToolUseFields).optional();

const modelUsageFields = {
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
  reasoningTokens: z.number().optional(),
  serverToolUse: serverToolUseField,
};
const WebSearchModelUsageSchema = z.object(modelUsageFields).strict();

export const WebSearchOutputSchema = z
  .object({
    query: z.string(),
    results: z.array(WebSearchResultItemSchema),
    sources: z.array(WebSearchSourceSchema),
    summary: z.string().optional(),
    durationMs: z.number().nonnegative(),
    webSearchRequests: z.number().int().nonnegative().optional(),
    modelUsage: WebSearchModelUsageSchema.optional(),
  })
  .strict();

export type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;

export const WebSearchOutputJsonSchema = toToolJsonSchema(WebSearchOutputSchema);

export const WEBSEARCH_PROVIDER_NATIVE_SPEC: ProviderNativeToolSpec = {
  kind: "provider_native",
  logicalName: "WebSearch",
  providerToolName: "web_search",
  fallback: "disabled",
};

export const WEBSEARCH_TOOL_CONTRACT: ToolContractDeclaration = {
  capability: "web_search",
  executionMode: "client",
  inputSchema: WebSearchInputJsonSchema,
  outputSchema: WebSearchOutputJsonSchema,
  permission: {
    permission: "websearch",
    reason:
      "WebSearch performs read-only provider-native web searches through an internal model request",
    riskLevel: "low",
    sideEffectScope: "network",
    needsApproval: false,
    patternSources: ["toolName", "input", "network"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 10_000,
    maxModelBytes: 20_000,
    strategy: "truncate",
    preview: {
      maxLines: 30,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: 60_000,
    maxMs: 120_000,
    allowCallOverride: true,
  },
  cancellation: {
    supported: true,
    cleanup: "bestEffort",
    userVisibleMessage: "WebSearch was cancelled",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "full",
    recordOutput: "summary",
  },
};
