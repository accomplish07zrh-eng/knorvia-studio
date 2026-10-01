// ============================================================
// WebSearch Tool
// ============================================================

import {
  WEBSEARCH_TOOL_CONTRACT,
  WebSearchInputJsonSchema,
  WebSearchInputSchema,
  WebSearchOutputJsonSchema,
  WebSearchOutputSchema,
} from "@knorvia/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";
import { formatWebSearchModelContent } from "./websearch-results.js";
import { executeWebSearch } from "./websearch-execution.js";

const WEBSEARCH_TOOL_NAME = "WebSearch";
const DEFAULT_TIMEOUT_MS = 60_000;

const WEBSEARCH_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function buildWebSearchProviderDescription(now: Date = new Date()): string {
  const currentMonth = `${WEBSEARCH_MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  return [
    "Search the web. Returns result blocks with titles and URLs. US-only.",
    "",
    `- The current month is ${currentMonth} — use this when searching for recent information.`,
    "- `allowed_domains` / `blocked_domains` filter results.",
    '- After answering from results, end with a "Sources:" list of the URLs you used as markdown links.',
  ].join("\n");
}

export const webSearchToolEntry: ToolEntry = {
  ...WEBSEARCH_TOOL_CONTRACT,
  providerNative: undefined,
  metadata: {
    name: WEBSEARCH_TOOL_NAME,
    // 写死月份会导致模型可见的 WebSearch 描述过期。
    // 每次读取时重新生成，避免长驻进程跨月后继续投递旧月份。
    get description() {
      return buildWebSearchProviderDescription();
    },
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: 20_000,
    sideEffectScope: "network",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: executeWebSearch as ToolHandler,
  formatModelContent: formatWebSearchModelContent,
  inputSchema: WebSearchInputJsonSchema,
  outputSchema: WebSearchOutputJsonSchema,
  runtimeInputSchema: WebSearchInputSchema,
  runtimeOutputSchema: WebSearchOutputSchema,
};
