import { escapeXml } from "../../runtime-task/notification.js";
import type { ToolHandlerFailure } from "../types.js";

export function workflowIntrospectionUnavailableFailure(): ToolHandlerFailure {
  return {
    result: false,
    errorCode: 1,
    message:
      "workflow_introspection_unavailable: this session cannot read workflow runs — workflow execution is not available here, so no run history is reachable. This is a capability gap, not an empty project.",
  };
}

export function workflowRunNotFoundFailure(runId: string): ToolHandlerFailure {
  return {
    result: false,
    errorCode: 2,
    message: `run_not_found: no workflow run with ID ${runId} exists for this project. Use ListWorkflowRuns to see the runs that do.`,
  };
}

export const WORKFLOW_RUN_INTROSPECTION_STEERING: string = [
  "Runs this session starts settle on their own: you receive a completion notification carrying the final output. Do NOT poll this tool while waiting for one — continue with other work.",
  "Reach for it when: (a) the user asks how a workflow is going, (b) you want to review this project's earlier runs, including ones other sessions started, (c) a completion notification was truncated and you need the run's full record by ID.",
].join("\n");

export function formatWorkflowRunTimestamp(epochMs: number): string {
  if (!Number.isFinite(epochMs)) {
    return String(epochMs);
  }
  try {
    return new Date(epochMs).toISOString();
  } catch {
    return String(epochMs);
  }
}

function padDurationPart(value: number): string {
  return value < 10 ? `0${String(value)}` : String(value);
}

export function formatWorkflowRunDuration(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? ms : 0;
  if (total < 60000) {
    return `${Math.floor(total / 1000)}s`;
  }
  if (total < 3600000) {
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    return `${minutes}m ${padDurationPart(seconds)}s`;
  }
  if (total < 86400000) {
    const hours = Math.floor(total / 3600000);
    const minutes = Math.floor((total % 3600000) / 60000);
    return `${hours}h ${padDurationPart(minutes)}m`;
  }
  const days = Math.floor(total / 86400000);
  const hours = Math.floor((total % 86400000) / 3600000);
  return `${days}d ${hours}h`;
}

export function formatRelativeAge(now: number, at: number | undefined): string | undefined {
  if (at === undefined || !Number.isFinite(at) || !Number.isFinite(now)) {
    return undefined;
  }
  return `${formatWorkflowRunDuration(now - at)} ago`;
}

export function formatWorkflowRunInstant(now: number, at: number): string {
  const age = formatRelativeAge(now, at);
  const timestamp = formatWorkflowRunTimestamp(at);
  return age === undefined ? timestamp : `${timestamp} (${age})`;
}

export function formatWorkflowRunCount(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.trunc(Math.abs(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}

export function workflowRunAttribute(name: string, value: string | number | boolean): string {
  const text = typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : String(value);
  return `${name}="${escapeXml(text)}"`;
}

export { escapeXml as escapeWorkflowRunText };
