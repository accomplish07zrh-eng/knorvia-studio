// SPDX-License-Identifier: Apache-2.0
// Source-exposed contract implementation; no new accepted runtime state or MIT claim.
import type { StudioKernelId, StudioTimeline } from "@knorvia/services";
import {
  collectGroupRunFacts,
  decodeGroupPlan,
  groupHostState,
  groupMemberState,
  groupProgressPhase,
  groupTaskState,
} from "./groupProgressFacts.js";
import type { GroupProgress, GroupTaskProgress } from "./groupProgressTypes.js";

export type { GroupProgress, GroupProgressState, GroupTaskProgress } from "./groupProgressTypes.js";

export function groupProgress(timeline?: StudioTimeline): GroupProgress | undefined {
  const run = timeline?.runs[0];
  if (!timeline || !run || run.kind !== "group" || !run.taskMode) return undefined;
  const definition = run.definition;
  if (!definition || !("members" in definition)) return undefined;
  const plan = decodeGroupPlan(run, definition.members);
  const facts = collectGroupRunFacts(run, timeline);
  const tasksByMember = new Map<StudioKernelId, GroupTaskProgress[]>();
  if (plan) {
    for (const task of plan.tasks) {
      const stepId = `group:round:${plan.round}:task:${task.id}`;
      const result = run.checkpoint.steps[stepId];
      let state = groupTaskState(run, facts, stepId);
      if (
        state === "queued" &&
        task.dependsOn?.some((id) => {
          const dependency = run.checkpoint.steps[`group:round:${plan.round}:task:${id}`];
          return dependency && dependency.status !== "succeeded";
        })
      )
        state = "blocked";
      const projected: GroupTaskProgress = {
        id: task.id,
        stepId,
        member: task.member,
        instruction: task.instruction,
        state,
        ...(result?.workspacePath || result?.changesSummary
          ? {
              evidence: {
                workspacePath: result.workspacePath,
                changesSummary: result.changesSummary,
              },
            }
          : {}),
      };
      const assigned = tasksByMember.get(task.member);
      if (assigned) assigned.push(projected);
      else tasksByMember.set(task.member, [projected]);
    }
  }
  const hostState = groupHostState(run, facts, plan !== undefined);
  const members = definition.members.map((id) => {
    const assigned = (tasksByMember.get(id) ?? []).slice();
    const states = assigned.map((task) => task.state);
    if (id === definition.host && hostState) states.push(hostState);
    return { id, state: groupMemberState(states), tasks: assigned };
  });
  return {
    runId: run.id,
    runState: run.state,
    phase: groupProgressPhase(run, plan, facts),
    round: plan?.round ?? 0,
    host: definition.host,
    members,
    review: plan?.review,
  };
}
