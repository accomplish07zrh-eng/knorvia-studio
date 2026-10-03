import {
  WebSearchOutputSchema,
  modelMessageContentToText,
  type ModelSource,
  type ModelTextResult,
  type ModelToolResult,
  type ModelUsage,
  type WebSearchInput,
  type WebSearchOutput,
  type WebSearchResultItem,
  type WebSearchSource,
} from "@knorvia/contracts";

import { firstUrls, resultItems, sourceItems } from "./websearch-response-tree.js";

const MAX_SOURCE_LINKS = 20;

export function buildWebSearchOutput(
  input: WebSearchInput,
  result: ModelTextResult,
  startedAt: number,
): WebSearchOutput {
  const results = firstUrls(extractResults(result.toolResults));
  const summary = result.text.trim() || undefined;
  const sources = firstUrls([
    ...extractSourcesFromModelSources(result.sources),
    ...extractSourcesFromResults(results),
    ...extractSourcesFromToolResults(result.toolResults),
    ...extractSourcesFromSummary(summary),
  ]);
  const modelUsage = hasModelUsage(result.usage) ? result.usage : undefined;

  return {
    query: input.query,
    results,
    sources,
    summary,
    durationMs: Date.now() - startedAt,
    webSearchRequests: result.usage.serverToolUse?.webSearchRequests,
    modelUsage,
  };
}

export function formatWebSearchModelContent(output: unknown): string {
  const parsed = WebSearchOutputSchema.safeParse(output);
  if (!parsed.success) return modelMessageContentToText(JSON.stringify(output) ?? "");

  const data = parsed.data;
  const links = firstUrls([...data.sources, ...extractSourcesFromResults(data.results)]).slice(
    0,
    MAX_SOURCE_LINKS,
  );
  const paragraphs = [`Web search results for query: "${data.query}"`];
  if (data.summary) paragraphs.push(`Summary:\n${data.summary}`);
  const linkLines = links.length
    ? links.map((source) => `- [${source.title ?? source.url}](${source.url})`)
    : ["- No links found."];
  paragraphs.push(["Links:", ...linkLines].join("\n"));
  paragraphs.push(
    "REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.",
  );
  return paragraphs.join("\n\n").trim();
}

function extractResults(toolResults: ModelToolResult[] | undefined): WebSearchResultItem[] {
  return (toolResults ?? []).flatMap((toolResult) => resultItems(toolResult.output));
}

function extractSourcesFromModelSources(sources: ModelSource[] | undefined): WebSearchSource[] {
  return (sources ?? [])
    .filter((source) => source.sourceType === "url" && typeof source.url === "string")
    .map((source) => ({ url: source.url!, title: source.title }));
}

function extractSourcesFromResults(results: WebSearchResultItem[]): WebSearchSource[] {
  return results.map((result) => ({ url: result.url, title: result.title }));
}

function extractSourcesFromToolResults(
  toolResults: ModelToolResult[] | undefined,
): WebSearchSource[] {
  return (toolResults ?? []).flatMap((toolResult) => sourceItems(toolResult.output));
}

function extractSourcesFromSummary(summary: string | undefined): WebSearchSource[] {
  if (!summary) return [];

  // WebSearch 内部请求改为流式后，provider 的引用有时只出现在
  // summary markdown 中，而不会经过 ModelStreamEvent 暴露为 sources/toolResults。
  const sources: WebSearchSource[] = [];
  const markdownLinkPattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
  for (const match of summary.matchAll(markdownLinkPattern)) {
    if (match.index !== undefined && summary[match.index - 1] === "!") {
      continue;
    }
    const title = match[1]?.trim();
    const url = match[2]?.trim();
    if (!url) continue;
    sources.push({ url, title: title || undefined });
  }

  return sources;
}

function hasModelUsage(usage: ModelUsage): boolean {
  return (
    usage.inputTokens !== undefined ||
    usage.outputTokens !== undefined ||
    usage.totalTokens !== undefined ||
    usage.cacheReadTokens !== undefined ||
    usage.cacheWriteTokens !== undefined ||
    usage.reasoningTokens !== undefined ||
    usage.serverToolUse?.webSearchRequests !== undefined ||
    usage.serverToolUse?.webFetchRequests !== undefined
  );
}
