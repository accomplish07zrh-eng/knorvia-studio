import type {
  DynamicWorkflowRunError,
  DynamicWorkflowRunLifecycleStatus,
  DynamicWorkflowRunStopReason,
  ModelUsage,
} from "@knorvia/contracts";
import type { RuntimeTaskType } from "./registry.js";
import { formatWorkflowProviderStopError } from "./workflow-notification-copy.js";

export {
  formatWorkflowEscalationNotification,
  formatWorkflowProviderStopError,
  formatWorkflowStallNotification,
  type WorkflowEscalationNotificationInput,
  type WorkflowStallNotificationInput,
} from "./workflow-notification-copy.js";

export interface TaskNotificationInput {
  agentId?: string;
  description?: string;
  error?: string;
  outputFile?: string;
  reports?: {
    count: number;
    preview: string;
    shown: number;
  };
  artifacts?: {
    count: number;
    preview: string;
    shown: number;
  };
  deliveryGuidance?: boolean;
  result?: string;
  status: string;
  runStatus?: Extract<DynamicWorkflowRunLifecycleStatus, "completed" | "errored" | "stopped">;
  stopReason?: DynamicWorkflowRunStopReason;
  scriptPath?: string;
  failure?: DynamicWorkflowRunError;
  stderrFile?: string;
  stdoutFile?: string;
  subagentType?: string;
  summary: string;
  taskId: string;
  taskType: RuntimeTaskType;
  toolUseId?: string;
  usage?: {
    durationMs?: number;
    modelUsage?: ModelUsage;
    toolUseCount?: number;
    totalTokens?: number;
  };
}

export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/gu, (character) => {
    switch (character) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      default:
        return "&quot;";
    }
  });
}

function escapeBasicXml(value: string): string {
  return value.replace(/[<>&]/gu, (character) => {
    switch (character) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return "&amp;";
    }
  });
}

export function truncateTaskNotification(value: string): string {
  return value.length <= 120000 ? value : `${value.slice(0, 120000)}\n[truncated]`;
}

function element(name: string, value: string): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

function numericElement(name: string, value: number): string {
  return `<${name}>${value}</${name}>`;
}

function agentUsage(usage: TaskNotificationInput["usage"]): string | undefined {
  if (!usage) return undefined;
  const metrics: string[] = [];
  const tokens = usage.totalTokens ?? usage.modelUsage?.totalTokens;
  if (tokens !== undefined) metrics.push(numericElement("subagent_tokens", tokens));
  if (usage.toolUseCount !== undefined)
    metrics.push(numericElement("tool_uses", usage.toolUseCount));
  if (usage.durationMs !== undefined) metrics.push(numericElement("duration_ms", usage.durationMs));
  return metrics.length ? `<usage>${metrics.join("")}</usage>` : undefined;
}

function generalUsage(usage: TaskNotificationInput["usage"]): string[] {
  if (!usage) return [];
  const metrics: string[] = [];
  const add = (name: string, value: number | undefined): void => {
    if (value !== undefined) metrics.push(`    ${numericElement(name, value)}`);
  };
  add("total-tokens", usage.totalTokens);
  add("tool-uses", usage.toolUseCount);
  add("duration-ms", usage.durationMs);
  add("input-tokens", usage.modelUsage?.inputTokens);
  add("output-tokens", usage.modelUsage?.outputTokens);
  add("cache-read-tokens", usage.modelUsage?.cacheReadTokens);
  add("cache-write-tokens", usage.modelUsage?.cacheWriteTokens);
  add("reasoning-tokens", usage.modelUsage?.reasoningTokens);
  return metrics.length ? ["  <usage>", ...metrics, "  </usage>"] : [];
}

function workflowGuidance(input: TaskNotificationInput): string {
  const status = input.runStatus ?? input.status;
  const paragraphs: string[] = [];
  const addArtifacts = (completed = false): void => {
    if (input.artifacts !== undefined) {
      paragraphs.push(
        completed
          ? "Artifacts listed above are already in front of the user as cards; refer to them by title and do not paste their contents. The one marked primary is the deliverable: point the user to it first."
          : "Artifacts listed above are already in front of the user.",
      );
    }
  };
  if (status === "completed") {
    paragraphs.push(
      "The workflow completed. Present its outcome to the user as a deliverable, in this order: the conclusion; each finding with its evidence (path and line, or the command and output that showed it); which findings were confirmed by a deterministic check or an independent subagent and which are judged only; what the run did not cover.",
      "The reported items above are individual findings: present them individually and keep their evidence. When the preview is partial (count greater than shown), say so and read the rest with GetWorkflowRun.",
    );
    addArtifacts(true);
    paragraphs.push("Do not restate the phase graph or the script.");
  } else if (input.stopReason === "user") {
    paragraphs.push(
      "The user stopped this workflow on purpose. Do not resume it with ResumeWorkflowRun and do not amend or rebuild it unless the user asks you to.",
      "Present what it finished before it was stopped: the reported items above are finished findings — show them individually with their evidence. Then stop and wait for the user to say what happens next.",
    );
    addArtifacts();
  } else if (input.stopReason === "model") {
    const scriptSuffix =
      input.scriptPath !== undefined
        ? ` Its script is at ${input.scriptPath}: edit that file and pass \`path\`.`
        : "";
    paragraphs.push(
      `You stopped this workflow with TaskStop. If you stopped it to fix the script, do that now: call AmendWorkflow with this run's ID and the corrected script — everything that settled before the stop is imported as cache, and the sooner the fix runs the less it re-pays. (Next time, amend the running run directly: AmendWorkflow stops it for you.)${scriptSuffix}`,
      "Otherwise present what it finished: the reported items above are finished findings — show them individually with their evidence. Resume it unchanged only if that is what the user wants.",
    );
    addArtifacts();
  } else if (input.stopReason === "provider") {
    paragraphs.push(
      "A provider-side error stopped this run; the <error> block above names the cause and the fix. Present what the run finished: the reported items above are finished findings — show them individually with their evidence.",
      `Then resolve the cause with the user before calling ResumeWorkflowRun with run_id="${input.taskId}" — finished steps replay from the journal. Do not rebuild the workflow.`,
    );
    addArtifacts();
  } else if (input.stopReason === "interrupted") {
    paragraphs.push(
      "The process that owned this run exited before it finished. Present what it finished: the reported items above are finished findings — show them individually with their evidence.",
      `Then call ResumeWorkflowRun with run_id="${input.taskId}" — finished steps replay from the journal and only the unfinished ones run again.`,
    );
    addArtifacts();
  } else if (input.stopReason === "superseded") {
    paragraphs.push(
      "This run was stopped because you amended it: a newer run supersedes it and is already running. Do not resume this run and do not amend it again; wait for the successor's notification.",
    );
    addArtifacts();
  } else if (status === "stopped") {
    paragraphs.push(
      "This workflow was stopped before it finished. Present what it salvaged first: the reported items above are finished findings — show them individually with their evidence.",
      `It can be continued with ResumeWorkflowRun (run_id="${input.taskId}"); ask the user before resuming a run you did not stop yourself.`,
    );
    addArtifacts();
  } else if (status === "errored") {
    paragraphs.push(
      "The workflow script failed. Present what it salvaged first: the reported items above are finished findings — show them individually with their evidence. Then explain the failure and what it means for the user's request.",
    );
    addArtifacts();
    paragraphs.push(
      input.scriptPath === undefined
        ? `Fix the script and submit it with AmendWorkflow (run_id="${input.taskId}") so finished work is reused. ResumeWorkflowRun will refuse this run: replaying the same script would fail the same way.`
        : `The run's script is at ${input.scriptPath}. Edit that file in place, then call AmendWorkflow (run_id="${input.taskId}", path="${input.scriptPath}") so finished work is reused — do not paste the script inline. ResumeWorkflowRun will refuse this run: replaying the same script would fail the same way.`,
    );
  } else {
    paragraphs.push(
      "The workflow did not complete. Present what it salvaged first: the reported items above are finished findings — show them individually with their evidence. Then explain the failure and what it means for the user's request.",
    );
    addArtifacts();
    paragraphs.push(
      "If the script itself was wrong, a corrected script submitted with AmendWorkflow re-uses the finished work; if the process died (error code Interrupted), the run is resumable as-is.",
    );
  }
  return paragraphs.join("\n");
}

function workflowNotification(input: TaskNotificationInput): string {
  const lines = ["<task-notification>", element("task-id", input.taskId)];
  if (input.toolUseId) lines.push(element("tool-use-id", input.toolUseId));
  if (input.outputFile) lines.push(element("output-file", input.outputFile));
  lines.push(element("status", input.runStatus ?? input.status));
  if (input.stopReason !== undefined) lines.push(element("stop-reason", input.stopReason));
  if (input.description) lines.push(element("description", input.description));
  lines.push(element("summary", input.summary));
  if (input.result !== undefined) lines.push(element("result", input.result));
  const providerError =
    input.failure?.providerStop !== undefined
      ? formatWorkflowProviderStopError(input.failure, input.taskId)
      : undefined;
  if (providerError !== undefined) {
    lines.push(`<error>\n${escapeBasicXml(providerError)}\n</error>`);
  } else if (input.error !== undefined) {
    lines.push(element("error", input.error));
  }
  for (const name of ["reports", "artifacts"] as const) {
    const section = input[name];
    if (section !== undefined) {
      const shown = section.shown < section.count ? ` shown="${section.shown}"` : "";
      lines.push(
        `<${name} count="${section.count}"${shown}>`,
        escapeXml(section.preview),
        `</${name}>`,
      );
    }
  }
  lines.push("</task-notification>");
  if (input.deliveryGuidance) lines.push("", workflowGuidance(input));
  return truncateTaskNotification(lines.join("\n"));
}

export function formatTaskNotification(input: TaskNotificationInput): string {
  if (input.taskType === "local_agent") {
    const lines = ["<task-notification>", element("task-id", input.taskId)];
    if (input.toolUseId) lines.push(element("tool-use-id", input.toolUseId));
    if (input.outputFile) lines.push(element("output-file", input.outputFile));
    lines.push(element("status", input.status), element("summary", input.summary));
    if (input.result !== undefined) lines.push(element("result", input.result));
    if (input.error !== undefined) lines.push(element("error", input.error));
    const usage = agentUsage(input.usage);
    if (usage !== undefined) lines.push(usage);
    lines.push("</task-notification>");
    return truncateTaskNotification(lines.join("\n"));
  }
  if (input.taskType === "local_bash") {
    const basicElement = (name: string, value: string): string =>
      `<${name}>${escapeBasicXml(value)}</${name}>`;
    const lines = ["<task-notification>", basicElement("task-id", input.taskId)];
    if (input.toolUseId) lines.push(basicElement("tool-use-id", input.toolUseId));
    if (input.outputFile) lines.push(basicElement("output-file", input.outputFile));
    lines.push(basicElement("status", input.status), basicElement("summary", input.summary));
    lines.push("</task-notification>");
    return lines.join("\n");
  }
  if (input.taskType === "local_workflow") return workflowNotification(input);

  const lines = ["<task-notification>", `  ${element("task-id", input.taskId)}`];
  if (input.toolUseId) lines.push(`  ${element("tool-use-id", input.toolUseId)}`);
  lines.push(`  ${element("task-type", input.taskType)}`);
  if (input.agentId) lines.push(`  ${element("agent-id", input.agentId)}`);
  if (input.subagentType) lines.push(`  ${element("subagent-type", input.subagentType)}`);
  if (input.outputFile) lines.push(`  ${element("output-file", input.outputFile)}`);
  if (input.stdoutFile) lines.push(`  ${element("stdout-file", input.stdoutFile)}`);
  if (input.stderrFile) lines.push(`  ${element("stderr-file", input.stderrFile)}`);
  lines.push(`  ${element("status", input.status)}`);
  if (input.description) lines.push(`  ${element("description", input.description)}`);
  lines.push(`  ${element("summary", input.summary)}`);
  if (input.result !== undefined) lines.push(`  ${element("result", input.result)}`);
  if (input.error !== undefined) lines.push(`  ${element("error", input.error)}`);
  lines.push(...generalUsage(input.usage), "</task-notification>");
  return truncateTaskNotification(lines.join("\n"));
}
