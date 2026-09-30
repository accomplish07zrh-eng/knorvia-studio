// Public declaration and model wording mechanically retained, not independently rewritten.
import type { ToolEntry } from "../types.js";
import {
  GlobInputJsonSchema,
  GlobInputSchema,
  GlobOutputJsonSchema,
  GlobOutputSchema,
  type GlobOutput,
} from "@knorvia/contracts";
import { executeGlob } from "./file-search-runtime.js";
const MAX_GLOB_MODEL_BYTES = 100_000;
const GLOB_TOOL_DESCRIPTION =
  'Fast file pattern matching. Supports glob patterns like "**/*.js" or "src/**/*.ts". Returns matching file paths sorted by modification time.';

export const globToolEntry: ToolEntry = {
  capability:
    "Find files by glob pattern through the file-system adapter without reading file contents",
  metadata: {
    name: "Glob",
    description: GLOB_TOOL_DESCRIPTION,
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: 30000,
    maxOutputBytes: MAX_GLOB_MODEL_BYTES,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: executeGlob,
  inputSchema: GlobInputJsonSchema,
  outputSchema: GlobOutputJsonSchema,
  runtimeInputSchema: GlobInputSchema,
  runtimeOutputSchema: GlobOutputSchema,
  formatModelContent: formatGlobModelContent,
  permission: {
    permission: "read",
    reason: "Glob only lists file paths and has no external side effects",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    patternSources: ["path", "input"],
    alwaysAllowPatternSources: ["path", "input"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_GLOB_MODEL_BYTES,
    maxModelBytes: MAX_GLOB_MODEL_BYTES,
    strategy: "artifact",
    preview: {
      maxBytes: MAX_GLOB_MODEL_BYTES,
      direction: "head",
    },
    artifact: {
      enabled: true,
      retention: "session",
    },
  },
  timeout: {
    defaultMs: 30000,
    maxMs: 30000,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "Glob was cancelled before file matches were returned",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

function formatGlobModelContent(output: unknown): string {
  const result = output as GlobOutput;
  const filenames = result.filenames ?? [];
  if (filenames.length === 0) return "No files found";

  const lines = [...filenames];
  if (result.truncated) {
    lines.push("(Results are truncated. Consider using a more specific path or pattern.)");
  }
  return lines.join("\n");
}
