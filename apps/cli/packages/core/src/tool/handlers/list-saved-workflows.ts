// SPDX-License-Identifier: Apache-2.0
// ListSavedWorkflows：枚举本项目保存的 dwf 定义（清单、无状态、有名字）。
// 与 ListWorkflowRuns 的 run 历史不是同一张表。handler 只读本会话工作目录；模型面走块式。

import {
  LIST_SAVED_WORKFLOWS_TOOL_NAME,
  ListSavedWorkflowsInputJsonSchema,
  ListSavedWorkflowsInputSchema,
  ListSavedWorkflowsOutputJsonSchema,
  ListSavedWorkflowsOutputSchema,
  SAVED_WORKFLOW_PROJECT_DIR,
  type ListSavedWorkflowsOutput,
  type ModelMessageContent,
} from "@knorvia/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";
import { listSavedWorkflows } from "./saved-workflows/index.js";
import { renderSavedWorkflowListing } from "./list-saved-workflows-model-renderer.js";
import { assembleReadonlyToolEntry } from "./workflow-readonly-surface.js";

const TIMEOUT_MS = 10000;
const MODEL_BYTE_CAP = 24000;

const ATTRIBUTE_ESCAPES: readonly (readonly [string, string])[] = [
  ["&", "&amp;"],
  ['"', "&quot;"],
  ["<", "&lt;"],
];

function savedWorkflowsDescription(): string {
  const folder = SAVED_WORKFLOW_PROJECT_DIR;
  const intro =
    "Lists the dynamic workflows saved in this project (`" +
    folder +
    "/`, keyed on the session's working directory) and the global archive (`~/.knorvia-studio/workflows`, available from every project). These are workflow DEFINITIONS you can run, not past runs — for the run history use ListWorkflowRuns instead.";
  const bullets = [
    "- Each row gives the name, what the workflow does, when to reach for it, and the arguments it takes.",
    "- Run one by passing its name to CreateWorkflow as `saved: { name, args }`. The user still confirms the run.",
    "- Check here before writing a workflow from scratch: if the project already saved one that fits, running it beats rebuilding it.",
    "- `invalid` lists saved files that could not be read (usually a hand-edited metadata block). They are named so they can be fixed, not silently skipped.",
  ];
  return intro + "\n\n" + bullets.join("\n");
}

const LIST_SAVED_WORKFLOWS_DESCRIPTION = savedWorkflowsDescription();

function readListing(cwd: string | undefined): ListSavedWorkflowsOutput {
  const directory = cwd ?? ".";
  const listing = listSavedWorkflows({ cwd: directory });
  const workflows = listing.entries;
  const invalid = listing.invalid;
  // 空的 invalid 不挂到输出上，否则每次调用都多一个空数组字段。
  if (invalid.length > 0) {
    return { workflows, invalid } as ListSavedWorkflowsOutput;
  }
  return { workflows } as ListSavedWorkflowsOutput;
}

const listSavedWorkflowsHandler: ToolHandler = async (call, scope) => {
  ListSavedWorkflowsInputSchema.parse(call);
  const cwd = scope.workingDirectory;
  return readListing(cwd);
};

function escapeAttribute(text: string): string {
  let escaped = text;
  for (const pair of ATTRIBUTE_ESCAPES) {
    const raw = pair[0];
    const encoded = pair[1];
    escaped = escaped.replaceAll(raw, encoded);
  }
  return escaped;
}

function emptyListing(): ModelMessageContent {
  const folder = SAVED_WORKFLOW_PROJECT_DIR;
  const sentence =
    "No workflows are saved in this project yet. Saved definitions live in " + folder + "/.";
  const lines = ['<saved_workflows count="0">', sentence, "</saved_workflows>"];
  return lines.join("\n");
}

function formatListSavedWorkflowsModelContent(raw: unknown): ModelMessageContent {
  const parsed = ListSavedWorkflowsOutputSchema.safeParse(raw);
  if (parsed.success === false) return "ListSavedWorkflows returned an invalid result.";
  const data = parsed.data;
  const workflows = data.workflows;
  const invalid = data.invalid;
  const bare = workflows.length === 0 && invalid === undefined;
  if (bare) return emptyListing();
  return renderSavedWorkflowListing(data, escapeAttribute);
}

const CAPABILITY = "List the reusable dynamic-workflow definitions saved in this project";
const CANCEL_TEXT =
  "ListSavedWorkflows scans the project's workflow directory synchronously and cannot be cancelled";
const PERMISSION_REASON =
  "ListSavedWorkflows reads the saved workflow definitions of the current project";

export const listSavedWorkflowsToolEntry: ToolEntry = assembleReadonlyToolEntry({
  capability: CAPABILITY,
  name: LIST_SAVED_WORKFLOWS_TOOL_NAME,
  description: LIST_SAVED_WORKFLOWS_DESCRIPTION,
  timeoutMs: TIMEOUT_MS,
  maxOutputBytes: MODEL_BYTE_CAP,
  permissionName: "listSavedWorkflows",
  permissionReason: PERMISSION_REASON,
  patternSources: ["toolName"],
  cancelMessage: CANCEL_TEXT,
  handler: listSavedWorkflowsHandler,
  inputSchema: ListSavedWorkflowsInputJsonSchema,
  outputSchema: ListSavedWorkflowsOutputJsonSchema,
  runtimeInputSchema: ListSavedWorkflowsInputSchema,
  runtimeOutputSchema: ListSavedWorkflowsOutputSchema,
  formatModelContent: formatListSavedWorkflowsModelContent,
  strategy: "truncate",
  persistArtifact: false,
});
