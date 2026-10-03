import {
  GetWorkflowRunOutputSchema,
  type GetWorkflowRunOutput,
  type ModelMessageContent,
} from "@knorvia/contracts";
import { formatWorkflowProviderStopError } from "../../runtime-task/notification.js";
import { formatPublishedArtifactLine } from "../executor/workflow-published-artifacts.js";
import {
  formatWorkflowRunHealthBlock,
  formatWorkflowRunLogTailBlock,
  formatWorkflowRunPhasesBlock,
  formatWorkflowRunSubagentsBlock,
} from "./get-workflow-run-format-roster.js";
import {
  escapeWorkflowRunText,
  formatRelativeAge,
  formatWorkflowRunInstant,
  formatWorkflowRunTimestamp,
  workflowRunAttribute,
} from "./workflow-run-introspection.js";

export function formatGetWorkflowRunModelContent(output: unknown): ModelMessageContent {
  const parsed = GetWorkflowRunOutputSchema.safeParse(output);
  if (!parsed.success) {
    return "GetWorkflowRun returned an invalid result.";
  }

  const run: GetWorkflowRunOutput = parsed.data;
  const terminal =
    run.status === "completed" || run.status === "errored" || run.status === "stopped";
  const blocks: string[] = [];

  blocks.push(`<summary>${escapeWorkflowRunText(run.summary)}</summary>`);
  blocks.push(`<run_id>${escapeWorkflowRunText(run.runId)}</run_id>`);
  blocks.push(
    `<label ${workflowRunAttribute("source", run.labelSource)}>${escapeWorkflowRunText(run.label)}</label>`,
  );
  blocks.push(`<status>${escapeWorkflowRunText(run.status)}</status>`);
  if (run.stopReason !== undefined) {
    blocks.push(`<stop_reason>${escapeWorkflowRunText(run.stopReason)}</stop_reason>`);
  }
  if (run.resumedFrom !== undefined) {
    blocks.push(`<resumed_from>${escapeWorkflowRunText(run.resumedFrom)}</resumed_from>`);
  }
  if (run.maxConcurrency !== undefined) {
    blocks.push(`<max_concurrency>${run.maxConcurrency}</max_concurrency>`);
  }
  if (run.subagentModel !== undefined) {
    blocks.push(`<subagent_model>${escapeWorkflowRunText(run.subagentModel)}</subagent_model>`);
  }
  if (run.supersededBy !== undefined) {
    blocks.push(`<superseded_by>${escapeWorkflowRunText(run.supersededBy)}</superseded_by>`);
  }
  blocks.push(`<owned_by_this_session>${run.ownedByThisSession}</owned_by_this_session>`);
  if (run.possiblyInterrupted) {
    blocks.push(
      "<possibly_interrupted>true — this session cannot confirm the run is still alive</possibly_interrupted>",
    );
  }
  blocks.push(
    `<created_at>${formatWorkflowRunInstant(run.generatedAt, run.createdAt)}</created_at>`,
  );
  blocks.push(
    `<updated_at>${formatWorkflowRunInstant(run.generatedAt, run.updatedAt)}</updated_at>`,
  );

  const questions = pendingQuestionBlock(run);
  if (questions !== undefined) {
    blocks.push(questions);
  }
  blocks.push(formatWorkflowRunHealthBlock(run, terminal));
  const phases = formatWorkflowRunPhasesBlock(run, terminal);
  if (phases !== undefined) {
    blocks.push(phases);
  }
  blocks.push(formatWorkflowRunSubagentsBlock(run));
  blocks.push(formatWorkflowRunLogTailBlock(run));

  blocks.push(
    `<usage>${[
      `spent_tokens=${run.usage.spentTokens}`,
      `nodes_observed=${run.usage.nodesObserved}`,
      `nodes_running=${run.usage.nodesRunning}`,
      `nodes_completed=${run.usage.nodesCompleted}`,
      `nodes_failed=${run.usage.nodesFailed}`,
    ].join(" ")}</usage>`,
  );
  if (run.result !== undefined) {
    blocks.push(`<result>\n${run.result}\n</result>`);
  }
  if (run.error !== undefined) {
    const body =
      run.error.providerStop === undefined
        ? escapeWorkflowRunText(run.error.message)
        : `\n${formatWorkflowProviderStopError(run.error, run.runId)}\n`;
    const attribute = workflowRunAttribute("code", run.error.code);
    blocks.push(`<error ${attribute}>${body}</error>`);
  }
  if (run.artifacts !== undefined && run.artifacts.length > 0) {
    const lines: string[] = [];
    for (const artifact of run.artifacts) {
      lines.push(escapeWorkflowRunText(formatPublishedArtifactLine(artifact)));
    }
    blocks.push(`<artifacts count="${run.artifacts.length}">\n${lines.join("\n")}\n</artifacts>`);
  }

  blocks.push(...routingBlocks(run));
  return blocks.join("\n\n");
}

function pendingQuestionBlock(run: GetWorkflowRunOutput): string | undefined {
  if (!run.health.pendingQuestionsKnown) {
    return "<pending_questions>Unknown: pending questions are tracked only by the process that owns the run, and this session does not. Resuming the run will re-ask any question its subagent still needs answered.</pending_questions>";
  }

  const questions = run.pendingQuestions ?? [];
  if (questions.length === 0) {
    return undefined;
  }

  const rows: string[] = [];
  for (const question of questions) {
    const who = question.actorName ?? question.actor;
    const age = formatRelativeAge(run.generatedAt, question.askedAt);
    const asked =
      age === undefined
        ? `asked at ${formatWorkflowRunTimestamp(question.askedAt)}`
        : `asked ${age}`;
    const lines = [
      `[${escapeWorkflowRunText(question.qid)}] ${escapeWorkflowRunText(who)} ${asked}`,
      escapeWorkflowRunText(question.question),
    ];
    if (question.context !== undefined) {
      lines.push(`context: ${escapeWorkflowRunText(question.context)}`);
    }
    rows.push(lines.join("\n"));
  }

  const instruction =
    "Each of these subagents is parked waiting for an answer and nothing times out on its behalf. Answer one with ResolveWorkflowQuestion using the ID in brackets. The rest of the run keeps running meanwhile.";
  return `<pending_questions>\n${rows.join("\n\n")}\n\n${instruction}\n</pending_questions>`;
}

function routingBlocks(run: GetWorkflowRunOutput): string[] {
  if (run.stopReason === "superseded") {
    const successor =
      run.supersededBy === undefined
        ? "its successor"
        : `run ${escapeWorkflowRunText(run.supersededBy)}`;
    return [
      `<superseded>This run was stopped by an AmendWorkflow and superseded by ${successor}, which owns its unfinished work. Do not resume it (ResumeWorkflowRun will refuse) and do not amend it again; read or amend ${successor} instead.</superseded>`,
    ];
  }

  const blocks: string[] = [];
  if (run.status === "stopped") {
    let reason = "";
    switch (run.stopReason) {
      case "user":
        reason = " This run was stopped on purpose by the user: resume it only when the user asks.";
        break;
      case "model":
        reason =
          " You stopped this run yourself with TaskStop: resume it unchanged only if that is what the user wants. If you stopped it to fix the script, do not wait — amend it now, see <amendable>.";
        break;
      case "provider":
        reason =
          " A provider-side error stopped it: resolve the cause named in <error> with the user before resuming, or it will stop again the same way.";
        break;
    }
    blocks.push(
      `<resumable>This run can be continued with ResumeWorkflowRun — it will resume under the same run ID, replaying finished steps and re-dispatching the unfinished ones.${reason} The script must be byte-for-byte the one this run was started with; to change it, see <amendable>.</resumable>`,
    );
  }
  blocks.push(amendableBlock(run));
  return blocks;
}

function amendableBlock(run: GetWorkflowRunOutput): string {
  const script =
    run.scriptPath === undefined
      ? ""
      : ` Its script is at ${escapeWorkflowRunText(run.scriptPath)}: edit that file in place and pass \`path: "${escapeWorkflowRunText(run.scriptPath)}"\` to AmendWorkflow instead of a script.`;

  if (run.status === "running" && run.health.stalledSince === undefined) {
    return `<amendable>AmendWorkflow with run_id "${escapeWorkflowRunText(run.runId)}" supersedes this run with a revised script and imports its finished work as cache.${script}</amendable>`;
  }

  let statusParagraph: string;
  switch (run.status) {
    case "errored":
      statusParagraph =
        "This is the highest-value case for it: the script itself failed, so fix the script and re-run — every step that already succeeded is imported instead of being paid for a second time. Do NOT rewrite from scratch.";
      break;
    case "completed":
      statusParagraph =
        "Use it to extend or refine a finished workflow — added steps run live, unchanged ones cost nothing.";
      break;
    case "stopped":
      statusParagraph =
        "Use it when the script or a setting needs to change; use ResumeWorkflowRun to continue it unchanged. A run stopped because its script was wrong is amended now, not after the user asks: the cache holds everything that settled before the stop, and waiting buys nothing.";
      break;
    default:
      statusParagraph =
        "It is still running: if the script is visibly wrong, amend it now — AmendWorkflow stops this run, imports everything that settled so far, and starts the revision in one call. Do not TaskStop it first and do not wait for it to finish.";
  }

  const paragraphs = [
    `This run can be superseded by a revised script: call AmendWorkflow with \`run_id: "${escapeWorkflowRunText(run.runId)}"\` and your new script.`,
    "That mints a NEW run and imports this one's finished work as a warm cache — matched per named subagent along its conversation prefix — so steps you did not change settle from cache at zero tokens and only the revised part runs live.",
    "To change only its settings (max_concurrency, subagent_model, name), omit both `script` and `path`: the new run keeps this run's script.",
    statusParagraph,
  ];
  return `<amendable>${paragraphs.join(" ")}${script}</amendable>`;
}
