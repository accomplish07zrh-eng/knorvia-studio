// SPDX-License-Identifier: Apache-2.0
// ListWorkflowRuns：按项目（会话工作目录）枚举 run 历史，含跨会话。
// 取端口、钉 cwd、投影契约形状在 operation 里；这里是引导文案和单行属性式模型面。
// 空列表必须说成一句话，空容器会被读成工具没答上来。

import {
  LIST_WORKFLOW_RUNS_TOOL_NAME,
  ListWorkflowRunsInputJsonSchema,
  ListWorkflowRunsInputSchema,
  ListWorkflowRunsOutputJsonSchema,
  ListWorkflowRunsOutputSchema,
  type ModelMessageContent,
} from "@knorvia/contracts";
import type { ToolEntry } from "../types.js";
import {
  WORKFLOW_RUN_INTROSPECTION_STEERING,
  formatWorkflowRunTimestamp,
  workflowIntrospectionUnavailableFailure,
  workflowRunAttribute,
} from "./workflow-run-introspection.js";
import { createListWorkflowRunsOperation } from "./list-workflow-runs-operation.js";
import {
  assembleReadonlyToolEntry,
  concatText,
  openReadonlySurface,
} from "./workflow-readonly-surface.js";

const TIMEOUT_MS = 10000;
const MODEL_BYTE_CAP = 24000;

const DESCRIPTION_INTRO =
  "Lists this project's dynamic-workflow runs (the session's working directory is the project key), most recently updated first. Includes runs started by other sessions — the run journal is per-project, not per-session.";

// 引导条目按短语切开再粘回。条目文本与原先整行字符串相同，只是不再各占一整行。
function bulletBody(): string {
  return concatText([
    "- Each row gives the run ID, its label, lifecycle status, ",
    "whether this session started it, tokens spent, and timestamps.\n",
    '- `possibly_interrupted="true"` means this session cannot confirm the run is still alive: ',
    "it may be a leftover from a process that exited, or a sibling session's run still in flight. ",
    "It is an annotation, not a verdict — do not report it as a failure.\n",
    "- Pass a run ID to GetWorkflowRun for progress detail, ",
    "the log tail, the final result, or the failure.\n",
    "- Three terminal states: `completed`; `errored` (the script itself failed); ",
    "`stopped` with `stop_reason` — `user` (cancelled on purpose: resume only when the user asks), ",
    "`model` (your own TaskStop), `provider` (a provider-side error stopped it: ",
    "read GetWorkflowRun for the cause, resolve it with the user, then resume), ",
    "`interrupted` (the owning process exited: continuing it is usually what the user wants), ",
    "`superseded` (an AmendWorkflow replaced it; `superseded_by` names the live successor — ",
    "never resume a superseded run).\n",
    "- Any stopped run other than a superseded one can be continued with ResumeWorkflowRun — ",
    "no rebuild needed, same run ID, same script. An errored run cannot.\n",
    "- ANY run here — completed, stopped, errored, or still running — ",
    "can instead be revised with AmendWorkflow: pass its run ID and the corrected script; ",
    "the new run imports the old one's finished work as a warm cache ",
    "(and stops it first if it is still running). ",
    "A run whose script errored is the case to reach for it — ",
    "fix the script instead of rewriting the workflow from scratch. ",
    "`resumed_from` on a row names the run it was amended from.",
  ]);
}

function composeDescription(): string {
  const steering = WORKFLOW_RUN_INTROSPECTION_STEERING;
  const head = DESCRIPTION_INTRO + "\n\n" + steering;
  return head + "\n\n" + bulletBody();
}

const LIST_WORKFLOW_RUNS_DESCRIPTION = composeDescription();

const reportUnavailable = workflowIntrospectionUnavailableFailure;
const listWorkflowRunsHandler = createListWorkflowRunsOperation(reportUnavailable);

function containerHeader(runs: readonly unknown[], truncated: boolean | undefined): string {
  const countAttr = workflowRunAttribute("count", runs.length);
  if (!truncated) return countAttr;
  return countAttr + " " + workflowRunAttribute("truncated", true);
}

type ListedRun = {
  runId: string;
  status: string;
  stopReason?: string;
  resumedFrom?: string;
  supersededBy?: string;
  label: string;
  labelSource: string;
  ownedByThisSession: boolean;
  possiblyInterrupted?: boolean;
  spentTokens: number;
  createdAt: number;
  updatedAt: number;
};

function pushAttr(parts: string[], attribute: string): void {
  parts.push(attribute);
}

/** 可选字段在「有值」时读两遍：先判定，再交给属性渲染。缺席只读一次。 */
function rowAttributes(run: ListedRun): string[] {
  const parts: string[] = ["<run"];
  pushAttr(parts, workflowRunAttribute("id", run.runId));
  pushAttr(parts, workflowRunAttribute("status", run.status));
  if (run.stopReason !== undefined) {
    pushAttr(parts, workflowRunAttribute("stop_reason", run.stopReason));
  }
  if (run.resumedFrom !== undefined) {
    pushAttr(parts, workflowRunAttribute("resumed_from", run.resumedFrom));
  }
  if (run.supersededBy !== undefined) {
    pushAttr(parts, workflowRunAttribute("superseded_by", run.supersededBy));
  }
  pushAttr(parts, workflowRunAttribute("label", run.label));
  pushAttr(parts, workflowRunAttribute("label_source", run.labelSource));
  pushAttr(parts, workflowRunAttribute("owned_by_this_session", run.ownedByThisSession));
  if (run.possiblyInterrupted) {
    pushAttr(parts, workflowRunAttribute("possibly_interrupted", true));
  }
  pushAttr(parts, workflowRunAttribute("spent_tokens", run.spentTokens));
  pushAttr(parts, workflowRunAttribute("created_at", formatWorkflowRunTimestamp(run.createdAt)));
  pushAttr(parts, workflowRunAttribute("updated_at", formatWorkflowRunTimestamp(run.updatedAt)));
  parts.push("/>");
  return parts;
}

// 表头先读一次 length，空列表判断再读一次。两次读取不能合并。
// prettier-ignore
function formatListWorkflowRunsModelContent(
  output: unknown
): ModelMessageContent {
  const verdict = ListWorkflowRunsOutputSchema.safeParse(output);
  if (verdict.success === false) return "ListWorkflowRuns returned an invalid result.";
  const data = verdict.data;
  const runs = data.runs;
  const truncated = data.truncated;
  const header = containerHeader(runs, truncated);
  const empty = runs.length === 0;
  if (empty) {
    const emptyLines = [
      "<workflow_runs " + header + ">",
      "No workflow runs recorded for this project.",
      "</workflow_runs>",
    ];
    return emptyLines.join("\n");
  }
  const rows = runs.map((run) => rowAttributes(run).join(" "));
  const block = ["<workflow_runs " + header + ">", ...rows, "</workflow_runs>"];
  return block.join("\n");
}

const CAPABILITY = "List this project's dynamic-workflow runs, including runs from other sessions";
const CANCEL_TEXT = "ListWorkflowRuns reads the run journal synchronously and cannot be cancelled";
const PERMISSION_REASON = "ListWorkflowRuns reads the run journal for the current project";

function publishListWorkflowRunsEntry(): ToolEntry {
  const parts = openReadonlySurface();
  parts.capability = CAPABILITY;
  parts.name = LIST_WORKFLOW_RUNS_TOOL_NAME;
  parts.description = LIST_WORKFLOW_RUNS_DESCRIPTION;
  parts.timeoutMs = TIMEOUT_MS;
  parts.maxOutputBytes = MODEL_BYTE_CAP;
  parts.permissionName = "listWorkflowRuns";
  parts.permissionReason = PERMISSION_REASON;
  parts.patternSources = ["toolName"];
  parts.cancelMessage = CANCEL_TEXT;
  parts.handler = listWorkflowRunsHandler;
  parts.inputSchema = ListWorkflowRunsInputJsonSchema;
  parts.outputSchema = ListWorkflowRunsOutputJsonSchema;
  parts.runtimeInputSchema = ListWorkflowRunsInputSchema;
  parts.runtimeOutputSchema = ListWorkflowRunsOutputSchema;
  parts.formatModelContent = formatListWorkflowRunsModelContent;
  parts.strategy = "truncate";
  parts.persistArtifact = false;
  return assembleReadonlyToolEntry(parts);
}

export const listWorkflowRunsToolEntry: ToolEntry = publishListWorkflowRunsEntry();
