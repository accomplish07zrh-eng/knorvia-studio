// Source-exposed compatibility/prose; applicable repository LICENSE/NOTICE.md remain.
import type { GetWorkflowRunSubagent } from "@knorvia/contracts";
import {
  escapeWorkflowRunText,
  formatRelativeAge,
  formatWorkflowRunDuration,
} from "./workflow-run-introspection.js";

function askLabel(ask: NonNullable<GetWorkflowRunSubagent["currentAsk"]>): string {
  let step = "";
  if (ask.actorSeq !== undefined) step = ` (step ${ask.actorSeq + 1})`;
  return `${escapeWorkflowRunText(ask.siteId)}@${ask.ordinal}${step}`;
}

export function renderWorkflowRunActivity(
  subagent: GetWorkflowRunSubagent,
  now: number,
  askedAtByQid: ReadonlyMap<string, number>,
): string {
  if (subagent.state === "parked" && subagent.parkedOn !== undefined) {
    const age = formatRelativeAge(now, askedAtByQid.get(subagent.parkedOn));
    const elapsed = age === undefined ? "" : ` for ${age.replace(/ ago$/u, "")}`;
    return `on question ${escapeWorkflowRunText(subagent.parkedOn)}${elapsed}`;
  }

  if (subagent.state === "waiting") {
    const wait = subagent.wait;
    if (wait === undefined) return "";
    const age = formatRelativeAge(now, wait.since);
    const elapsed = age === undefined ? "" : ` for ${age.replace(/ ago$/u, "")}`;
    if (wait.cause === "slot") return `waiting for a slot${elapsed}`;
    let reason = "";
    if (wait.reason !== undefined) reason = ` after ${escapeWorkflowRunText(wait.reason)}`;
    let retry = "";
    if (wait.retryAfterMs !== undefined)
      retry = `, retry in ${formatWorkflowRunDuration(wait.retryAfterMs)}`;
    return `backoff${reason}${elapsed}${retry}`;
  }

  if (subagent.state === "unfinished" && subagent.currentAsk !== undefined)
    return `${askLabel(subagent.currentAsk)} was in flight at the stop`;

  if (subagent.currentAsk !== undefined) {
    const ask = subagent.currentAsk;
    const details = [askLabel(ask)];
    const age = formatRelativeAge(now, ask.startedAt);
    if (age !== undefined) details.push(`${age.replace(/ ago$/u, "")} on this step`);
    if (ask.turn !== undefined) details.push(`turn ${ask.turn}`);
    if (ask.toolCalls !== undefined)
      details.push(`${ask.toolCalls} tool call${ask.toolCalls === 1 ? "" : "s"}`);
    if (ask.lastTool !== undefined) {
      let target = "";
      if (ask.lastTool.target !== undefined)
        target = ` ${escapeWorkflowRunText(ask.lastTool.target)}`;
      const toolAge = formatRelativeAge(now, ask.lastTool.at);
      details.push(
        `last ${escapeWorkflowRunText(ask.lastTool.name)}${target}${toolAge === undefined ? "" : ` ${toolAge}`}`,
      );
    }
    return details.join(", ");
  }

  if (subagent.stepsSettled === 0 && subagent.stepsFailed === 0) return "";
  let failures = "";
  if (subagent.stepsFailed > 0) failures = `, ${subagent.stepsFailed} failed`;
  return `${subagent.stepsSettled} step${subagent.stepsSettled === 1 ? "" : "s"}${failures}`;
}
