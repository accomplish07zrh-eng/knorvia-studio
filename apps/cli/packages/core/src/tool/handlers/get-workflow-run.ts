// SPDX-License-Identifier: Apache-2.0
// 单 run 即时快照：不等待、不阻塞。门面只做四件事——产物序列化、未知 runId 的结构化失败、
// 一次时钟（年龄同源）、摘要最后拼。等待语义属于 TaskOutput。

import {
  GET_WORKFLOW_RUN_TOOL_NAME,
  GetWorkflowRunInputJsonSchema,
  GetWorkflowRunInputSchema,
  GetWorkflowRunOutputJsonSchema,
  GetWorkflowRunOutputSchema,
  type DynamicWorkflowRunDetail,
  type GetWorkflowRunInput,
  type GetWorkflowRunOutput,
} from "@knorvia/contracts";
import { serializeWorkflowArtifact } from "../executor/workflow-artifact.js";
// artifact 一词两义：上面序列化脚本顶层返回值（`<result>`）；下面常量数的是脚本发布给用户看的
// 产出清单（`<artifacts>`）。两处都出现在本工具输出里。
import { WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES } from "../executor/workflow-published-artifacts.js";
import type { ToolEntry, ToolHandler } from "../types.js";
import { formatGetWorkflowRunModelContent } from "./get-workflow-run-format.js";
import {
  toGetWorkflowRunHealth,
  toGetWorkflowRunPhases,
  toGetWorkflowRunSubagents,
} from "./get-workflow-run-roster-output.js";
import { buildWorkflowRunSummary } from "./get-workflow-run-summary.js";
import { projectGetWorkflowRunSnapshotFields } from "./get-workflow-run-snapshot-fields.js";
import {
  applyWorkflowRunOutputFields,
  projectWorkflowRunArtifact,
  projectWorkflowRunError,
  projectWorkflowRunQuestion,
} from "./get-workflow-run-output-fields.js";
import {
  WORKFLOW_RUN_INTROSPECTION_STEERING,
  workflowIntrospectionUnavailableFailure,
  workflowRunNotFoundFailure,
} from "./workflow-run-introspection.js";
import {
  assembleReadonlyToolEntry,
  concatText,
  openReadonlySurface,
} from "./workflow-readonly-surface.js";

const TIMEOUT_MS = 10000;
const RESULT_BUDGET_BYTES = 400000;
const PERSIST_THRESHOLD_CHARS = 100000;

const DESCRIPTION_INTRO =
  "Returns the current state of one dynamic-workflow run: progress, token usage and the tail of its log() narration while it runs; the final result once it completed; the structured failure if it errored or was stopped.";

// 引导条目按短语切开再粘回。条目文本与原先整行字符串相同，只是不再各占一整行。
function bulletBody(): string {
  return concatText([
    "- Takes run_id — from CreateWorkflow's or AmendWorkflow's result, ",
    "from a completion notification, or from ListWorkflowRuns.\n",
    "- This is an instant snapshot and never waits. ",
    "To block until a run THIS session started finishes, use TaskOutput instead: ",
    "that is the waiting tool. GetWorkflowRun is the right tool when you must not wait, ",
    "or when the run belongs to another session (TaskOutput cannot see those).\n",
    "- The `artifacts` section lists what the run published for the user — ",
    "files, documents and live dashboards that are ALREADY shown to them as cards. ",
    "Refer to one by its title; do not paste its contents back. ",
    "The one marked `primary` is the deliverable: point the user to it first.\n",
    "- Three terminal states: `completed`; `errored` ",
    "(the script itself failed — not resumable, amend it); ",
    "`stopped` with a stop reason — `user` (cancelled on purpose: resume only when the user asks), ",
    "`model` (your own TaskStop), `provider` (a provider-side error such as an expired sign-in, ",
    "a model missing from the plan or a quota cap — the `<error>` block names the cause and the fix; ",
    "resolve it with the user, then resume), `interrupted` (the process that owned the run exited — ",
    "continuing it is usually what the user wants), `superseded` (an AmendWorkflow replaced it; ",
    "`<superseded_by>` names the successor — read that run instead, never resume this one).\n",
    "- A stopped run (other than a superseded one) can be continued with ResumeWorkflowRun — ",
    "no rebuild needed, same run ID, same script.\n",
    "- ANY run — completed, stopped, errored, or still running — ",
    "can instead be revised with AmendWorkflow: ",
    "pass its run ID and the corrected script, and the finished work is imported as cache. ",
    "When the script itself errored, that is the move — ",
    "fix the script and keep the work that already succeeded, rather than rewriting from scratch.",
  ]);
}

function composeDescription(): string {
  const steering = WORKFLOW_RUN_INTROSPECTION_STEERING;
  const head = DESCRIPTION_INTRO + "\n\n" + steering;
  return head + "\n\n" + bulletBody();
}

const GET_WORKFLOW_RUN_DESCRIPTION = composeDescription();

type SnapshotFields = Omit<GetWorkflowRunOutput, "summary">;

/**
 * 情势截面。pendingQuestions / artifacts 的 admission 会读两遍，投影是第三次读取，
 * 不能把第一次的值存下来——第二次可能是另一个形状（冻结探针）。
 */
function projectBase(
  detail: DynamicWorkflowRunDetail,
  result: string | undefined,
  generatedAt: number,
  workingDirectory: () => string | undefined,
): SnapshotFields {
  const subagentRoster = toGetWorkflowRunSubagents(detail.subagents);
  const phaseList = toGetWorkflowRunPhases(detail.phases);
  const snapshot = projectGetWorkflowRunSnapshotFields(detail, generatedAt, workingDirectory);
  const readPhases = () => phaseList;
  const readSubagents = () => subagentRoster.subagents;
  const readTruncated = () => subagentRoster.truncated;
  const markTruncated = () => true;
  const readHealth = () => toGetWorkflowRunHealth(detail.health);
  const readResult = () => result;
  const readError = () => detail.error;
  const projectError = () => projectWorkflowRunError(detail);
  const readQuestions = () => detail.pendingQuestions;
  // 直接写在 detail 上：V8 把调用表达式原文放进 TypeError，探针要比对这段文本。
  const projectQuestions = () =>
    detail.pendingQuestions!.map((question) => projectWorkflowRunQuestion(question));
  const readArtifacts = () => detail.artifacts;
  const projectArtifacts = () => {
    const capped = detail.artifacts!.slice(0, WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES);
    return capped.map((artifact) => projectWorkflowRunArtifact(artifact));
  };
  return applyWorkflowRunOutputFields<SnapshotFields>(snapshot, [
    ["phases", readPhases, "defined"],
    ["subagents", readSubagents],
    ["subagentsTruncated", readTruncated, "truthy", markTruncated],
    ["health", readHealth],
    ["result", readResult, "defined"],
    ["error", readError, "defined", projectError],
    ["pendingQuestions", readQuestions, "nonempty", projectQuestions],
    ["artifacts", readArtifacts, "nonempty", projectArtifacts],
  ]);
}

const getWorkflowRunHandler: ToolHandler = async (call, scope) => {
  const parsed = GetWorkflowRunInputSchema.parse(call) as GetWorkflowRunInput;
  const port = scope.dynamicWorkflowRunPort;
  if (port === undefined) return workflowIntrospectionUnavailableFailure();
  if (typeof port.getRunDetail !== "function") return workflowIntrospectionUnavailableFailure();
  const record = await port.getRunDetail(parsed.run_id);
  if (record === undefined) {
    return workflowRunNotFoundFailure(parsed.run_id);
  }
  // result 序列化（读 record.result）→ 读一次时钟 → 情势截面。摘要在展开 base 之后才算。
  const serialized = serializeWorkflowArtifact(record.result);
  const clock = Date.now();
  const base = projectBase(record, serialized, clock, () => scope.workingDirectory);
  const shaped = {
    ...base,
    summary: buildWorkflowRunSummary(base),
  } satisfies GetWorkflowRunOutput;
  return shaped;
};

const CAPABILITY = "Read one dynamic-workflow run's progress, final result, or failure";
const CANCEL_TEXT = "GetWorkflowRun reads the run journal synchronously and cannot be cancelled";
const PERMISSION_REASON = "GetWorkflowRun reads one run's record from the project's run journal";

function publishGetWorkflowRunEntry(): ToolEntry {
  const parts = openReadonlySurface();
  parts.capability = CAPABILITY;
  parts.name = GET_WORKFLOW_RUN_TOOL_NAME;
  parts.description = GET_WORKFLOW_RUN_DESCRIPTION;
  parts.timeoutMs = TIMEOUT_MS;
  parts.maxOutputBytes = RESULT_BUDGET_BYTES;
  parts.permissionName = "getWorkflowRun";
  parts.permissionReason = PERMISSION_REASON;
  parts.patternSources = ["toolName", "input"];
  parts.cancelMessage = CANCEL_TEXT;
  parts.handler = getWorkflowRunHandler;
  parts.inputSchema = GetWorkflowRunInputJsonSchema;
  parts.outputSchema = GetWorkflowRunOutputJsonSchema;
  parts.runtimeInputSchema = GetWorkflowRunInputSchema;
  parts.runtimeOutputSchema = GetWorkflowRunOutputSchema;
  parts.formatModelContent = formatGetWorkflowRunModelContent;
  parts.strategy = "artifact";
  parts.persistArtifact = true;
  parts.maxModelChars = PERSIST_THRESHOLD_CHARS;
  parts.resultArtifactContentType = "text/plain";
  return assembleReadonlyToolEntry(parts);
}

export const getWorkflowRunToolEntry: ToolEntry = publishGetWorkflowRunEntry();
