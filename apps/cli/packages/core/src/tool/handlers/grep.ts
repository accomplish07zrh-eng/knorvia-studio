// Public declaration and model wording mechanically retained, not independently rewritten.
import type { ToolEntry } from "../types.js";
import {
  GrepInputJsonSchema,
  GrepInputSchema,
  GrepOutputJsonSchema,
  GrepOutputSchema,
  type GrepOutput,
} from "@knorvia/contracts";
import { executeGrep } from "./file-search-runtime.js";
const MAX_GREP_MODEL_BYTES = 20_000;
const DEFAULT_GREP_TIMEOUT_MS = 30_000;
const GREP_TOOL_DESCRIPTION = `Content search built on ripgrep. Prefer this over \`grep\`/\`rg\` via Bash — results integrate with the permission UI and file links.

- Full regex syntax (e.g. "log.*Error", "function\\s+\\w+"). Ripgrep, not grep — escape literal braces (\`interface\\{\\}\`).
- Filter with \`glob\` (e.g. "**/*.tsx") or \`type\` (e.g. "js", "py", "rust").
- \`output_mode\`: "content" (matching lines), "files_with_matches" (paths only, default), or "count".
- \`multiline: true\` for patterns that span lines.`;

export const grepToolEntry: ToolEntry = {
  capability: "Search file contents with ripgrep-compatible regular expressions",
  metadata: {
    name: "Grep",
    description: GREP_TOOL_DESCRIPTION,
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: DEFAULT_GREP_TIMEOUT_MS,
    maxOutputBytes: MAX_GREP_MODEL_BYTES,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: executeGrep,
  inputSchema: GrepInputJsonSchema,
  outputSchema: GrepOutputJsonSchema,
  runtimeInputSchema: GrepInputSchema,
  runtimeOutputSchema: GrepOutputSchema,
  formatModelContent: formatGrepModelContent,
  permission: {
    permission: "read",
    reason: "Grep only searches file contents and has no external side effects",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    patternSources: ["path", "input"],
    alwaysAllowPatternSources: ["path", "input"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_GREP_MODEL_BYTES,
    maxModelBytes: MAX_GREP_MODEL_BYTES,
    strategy: "artifact",
    preview: {
      maxBytes: MAX_GREP_MODEL_BYTES,
      direction: "head",
    },
    artifact: {
      enabled: true,
      retention: "session",
    },
  },
  timeout: {
    defaultMs: DEFAULT_GREP_TIMEOUT_MS,
    maxMs: DEFAULT_GREP_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "Grep was cancelled before search results were returned",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

function formatGrepModelContent(output: unknown): string {
  const result = output as GrepOutput;
  const mode = result.mode ?? "files_with_matches";
  const limitInfo = formatLimitInfo(result.appliedLimit, result.appliedOffset);

  if (mode === "content") {
    const content = result.content || "No matches found";
    return limitInfo ? `${content}\n\n[Showing results with pagination = ${limitInfo}]` : content;
  }

  if (mode === "count") {
    const content = result.content || "No matches found";
    const matches = result.numMatches ?? 0;
    const files = result.numFiles ?? 0;
    const summary = `Found ${matches} total ${plural(matches, "occurrence")} across ${files} ${plural(files, "file")}.`;
    return `${content}\n\n${summary}${limitInfo ? ` with pagination = ${limitInfo}` : ""}`;
  }

  const filenames = result.filenames ?? [];
  const fileCount = result.numFiles ?? filenames.length;
  if (fileCount === 0) return "No files found";

  return `Found ${fileCount} ${plural(fileCount, "file")}${limitInfo ? ` ${limitInfo}` : ""}\n${filenames.join("\n")}`;
}

function formatLimitInfo(appliedLimit?: number, appliedOffset?: number): string {
  const parts: string[] = [];
  if (appliedLimit !== undefined) parts.push(`limit: ${appliedLimit}`);
  if (appliedOffset !== undefined) parts.push(`offset: ${appliedOffset}`);
  return parts.join(", ");
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
