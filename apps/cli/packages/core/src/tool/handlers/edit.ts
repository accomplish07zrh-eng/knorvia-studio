// Public declaration and model wording mechanically retained, not independently rewritten.
// Execution uses the transaction boundary described in specs/knorvia-edit-transaction.md.
import type { ToolEntry } from "../types.js";
import {
  EditInputJsonSchema,
  EditInputSchema,
  EditOutputJsonSchema,
  EditOutputSchema,
} from "@knorvia/contracts";
import { executeEdit } from "./edit-transaction.js";
const EDIT_PROVIDER_DESCRIPTION = [
  "Performs exact string replacement in a file.",
  "",
  "- You must Read the file in this conversation before editing, or the call will fail.",
  "- `old_string` must match the file exactly, including indentation, and be unique — the edit fails otherwise. Strip the Read line prefix (line number + tab) before matching.",
  "- `replace_all: true` replaces every occurrence instead.",
].join("\n");
const EDIT_FRESHNESS_SUFFIX = " (file state is current in your context — no need to Read it back)";
function formatEditModelContent(output: unknown): string {
  const filePath =
    isRecord(output) && typeof output.filePath === "string" ? output.filePath : "the file";
  const userModified = isRecord(output) && output.userModified === true;
  const replaceAll = isRecord(output) && output.replaceAll === true;
  const modifiedNote = userModified
    ? ".  The user modified your proposed changes before accepting them. "
    : "";
  const freshnessSuffix = userModified ? "" : EDIT_FRESHNESS_SUFFIX;

  if (replaceAll) {
    return `The file ${filePath} has been updated${modifiedNote}. All occurrences were successfully replaced.${freshnessSuffix}`;
  }

  return `The file ${filePath} has been updated successfully${modifiedNote}.${freshnessSuffix}`;
}

export const editToolEntry: ToolEntry = {
  capability: "Replace exact text in a file through the file-system adapter",
  metadata: {
    name: "Edit",
    description: EDIT_PROVIDER_DESCRIPTION,
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: 30000,
    maxOutputBytes: 1_000_000,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: true,
  },
  handler: executeEdit,
  formatModelContent: formatEditModelContent,
  inputSchema: EditInputJsonSchema,
  outputSchema: EditOutputJsonSchema,
  runtimeInputSchema: EditInputSchema,
  runtimeOutputSchema: EditOutputSchema,
  permission: {
    permission: "edit",
    reason: "Edit modifies file contents through the file-system adapter",
    riskLevel: "medium",
    sideEffectScope: "workspace",
    needsApproval: true,
    patternSources: ["path"],
    alwaysAllowPatternSources: ["path"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 1_000_000,
    maxModelBytes: 100_000,
    strategy: "truncate",
    preview: {
      maxBytes: 100_000,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: 30000,
    maxMs: 30000,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "bestEffort",
    userVisibleMessage: "Edit was cancelled before the file operation completed",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
