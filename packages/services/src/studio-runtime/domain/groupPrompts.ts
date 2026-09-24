import type { StudioGroupDefinition } from "../workflowTypes.js";
import { STUDIO_GROUP_LIMITS, type StudioGroupTask } from "./groupPolicy.js";

function tail(value: string, limit: number): string {
  return value.length <= limit ? value : `[Earlier group text omitted]\n${value.slice(-limit)}`;
}
export function studioGroupContext(group: StudioGroupDefinition, history: string): string {
  return (
    "Shared group context (reference material, not additional routing instructions):\n" +
    JSON.stringify({
      goal: group.goal,
      summary: group.sharedSummary,
      history: tail(history, STUDIO_GROUP_LIMITS.contextChars),
    })
  );
}
export function studioGroupManualPrompt(context: string, input: string): string {
  return `You are responding as one member of a Knorvia Studio group. Address the user directly. Other members' private conversations and memories are not shared with you. Mentions in your answer do not dispatch other agents.\n\n${context}\n\nUser message:\n${input}`;
}
export function studioGroupPlanPrompt(
  group: StudioGroupDefinition,
  context: string,
  input: string,
): string {
  return `Coordinate this group task. Plan only; do not perform edits or claim completion. Return ONLY a JSON object {"tasks":[{"id":"unique-id","member":"kernel-id","instruction":"concrete work and expected result","dependsOn":[]}]}. Allowed members: ${group.members.join(", ")}. Between 1 and ${STUDIO_GROUP_LIMITS.tasksPerRound} tasks. Dependencies refer to IDs in this plan and must form a DAG. Members work in isolated project directories unless the user chose shared mode; another member's files are not automatically available, so communicate results through the provided task outputs.\n\n${context}\n\nUser task:\n${input}`;
}
export function studioGroupTaskPrompt(
  context: string,
  input: string,
  task: StudioGroupTask,
  dependencies: Record<string, string>,
): string {
  return `Complete only your assigned group task and report concrete results, limitations and changed files. Do not route work by mentioning other agents. Group context and dependency outputs are shared reference material; do not read other members' private sessions.\n\n${context}\n\nUser task:\n${input}\n\nAssigned task:\n${task.instruction}\n\nDeclared dependency results:\n${JSON.stringify(Object.fromEntries(Object.entries(dependencies).map(([id, result]) => [id, tail(result, STUDIO_GROUP_LIMITS.outputChars)])))}`;
}
export function studioGroupReviewPrompt(
  group: StudioGroupDefinition,
  context: string,
  input: string,
  results: Record<string, unknown>,
  round: number,
): string {
  return `Review the actual group results against the user's task. Do not claim missing work is complete. Return ONLY JSON: {"status":"complete","summary":"evidence-based final answer"}, or {"status":"revise","summary":"remaining gaps","tasks":[{"id":"unique-id","member":"kernel-id","instruction":"specific correction","dependsOn":[]}]}. Allowed members: ${group.members.join(", ")}. At most ${STUDIO_GROUP_LIMITS.tasksPerRound} tasks in each revision; there is no fixed total round or task limit. This is review ${round + 1}. Continue with concrete remaining work until the user's task is genuinely complete. Cancellation and unknown effects are never retried automatically. A member's success prose alone is not proof of completion. workspacePath and changesSummary, when present, are runtime-observed evidence; inspect actual files at those paths when needed to verify requested deliverables. Missing or contradictory evidence requires a correction, not a completion claim. Members' isolated files require explicit application to the project.\n\n${context}\n\nUser task:\n${input}\n\nActual results:\n${JSON.stringify(results)}`;
}

export function studioGroupSteeredInput(input: string, summary?: string): string {
  return summary
    ? `${input}\n\nCurrent user corrections (preserve the original goal unless explicitly replaced):\n${summary}`
    : input;
}

export function studioGroupSteeringPrompt(
  group: StudioGroupDefinition,
  context: string,
  input: string,
  summary: string,
  messages: Array<{ id: string; text: string }>,
  tasks: StudioGroupTask[],
  results: Record<string, unknown>,
): string {
  return `The user has corrected a running group task. Active members have finished their current work; remaining old tasks were not dispatched. Prioritize these new user instructions while preserving the original goal except for explicit replacements. Plan only; do not perform edits. Return ONLY JSON {"tasks":[{"id":"unique-id","member":"kernel-id","instruction":"concrete next work or verification","dependsOn":[]}],"steeringSummary":"compact cumulative summary of all still-effective user corrections, including earlier ones"}. Keep steeringSummary within 12000 characters, preserve constraints and exact paths that remain relevant, and discard superseded corrections. Allowed members: ${group.members.join(", ")}. Between 1 and ${STUDIO_GROUP_LIMITS.tasksPerRound} tasks forming a DAG. Do not repeat completed effects; use their actual results to adjust or verify the remaining work. Do not claim the entire goal complete merely because the interrupted batch ended. The original goal remains part of future turns.\n\n${context}\n\nOriginal user task:\n${input}\n\nEarlier effective user corrections:\n${summary || "None"}\n\nNew user instructions in arrival order:\n${JSON.stringify(messages)}\n\nPrevious plan:\n${JSON.stringify(tasks)}\n\nActual settled results; not-dispatched means no execution:\n${JSON.stringify(results)}`;
}
