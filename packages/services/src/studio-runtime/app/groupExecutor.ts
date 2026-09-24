import type { StudioExecutionPort } from "./ports.js";
import type { StudioGroupDefinition, StudioStepResult } from "../workflowTypes.js";
import {
  parseStudioGroupPlan,
  parseStudioGroupReview,
  routeStudioGroupMembers,
  STUDIO_GROUP_LIMITS,
  validateStudioGroup,
  type StudioGroupReview,
} from "../domain/groupPolicy.js";
import {
  studioGroupContext,
  studioGroupManualPrompt,
  studioGroupPlanPrompt,
  studioGroupReviewPrompt,
  studioGroupSteeredInput,
  studioGroupSteeringPrompt,
} from "../domain/groupPrompts.js";
import {
  GroupStepFailure,
  studioGroupCall,
  studioGroupHostJson,
  studioGroupTasks,
} from "./groupSteps.js";
import { workflowFailed, workflowStopped } from "./workflowSteps.js";
import {
  acknowledgeStudioGroupSteering,
  hasStudioGroupSteering,
  parseStudioGroupSteeringPlan,
  savedStudioGroupPlan,
  snapshotStudioGroupSteering,
  studioGroupSteeringResults,
  type GroupCheckpoint,
} from "./groupSteering.js";

async function manual(
  group: StudioGroupDefinition,
  input: string,
  context: string,
  port: StudioExecutionPort,
): Promise<StudioStepResult> {
  const members = routeStudioGroupMembers(group, input);
  const stop = new AbortController();
  const results = await Promise.all(
    members.map(async (member) => {
      const result = await studioGroupCall(port, {
        id: `group:manual:${member}`,
        kernel: member,
        memberId: member,
        signal: stop.signal,
        prompt: studioGroupManualPrompt(context, input),
      });
      if (!result.resultKnown || result.status === "interrupted" || result.status === "cancelled")
        stop.abort(new Error("A group member could not finish safely."));
      return { member, result };
    }),
  );
  const unsafe =
    results.find(({ result }) => !result.resultKnown || result.status === "interrupted") ??
    results.find(({ result }) => result.status === "cancelled") ??
    results.find(({ result }) => result.status !== "succeeded");
  if (unsafe) return unsafe.result;
  return {
    status: "succeeded",
    resultKnown: true,
    text: results
      .map(({ member, result }) =>
        members.length === 1 ? result.text : `${member}:\n${result.text}`,
      )
      .join("\n\n"),
  };
}

async function task(
  group: StudioGroupDefinition,
  input: string,
  context: string,
  port: StudioExecutionPort,
): Promise<StudioStepResult> {
  let record = savedStudioGroupPlan(group, port);
  if (!record) {
    const plan = await studioGroupHostJson(
      group,
      port,
      "group:plan:0",
      studioGroupPlanPrompt(group, context, input),
      (text) => parseStudioGroupPlan(text, group),
    );
    record = {
      version: 1,
      round: 0,
      tasks: plan.tasks,
      dispatched: plan.tasks.length,
      phase: "tasks",
    };
    await port.saveCheckpoint({ plan: record });
  }
  // 用户要求持续处理到完成或停止；单批数量是资源上限，不构成总轮数或总派发预算。
  while (true) {
    if (port.signal.aborted) return workflowStopped(port.signal);
    record = await acknowledgeStudioGroupSteering(record, port);
    if (port.signal.aborted) return workflowStopped(port.signal);
    if (record.phase === "steering" || hasStudioGroupSteering(port)) {
      record = await steer(group, input, context, record, port);
      continue;
    }
    if (record.phase === "complete")
      return { status: "succeeded", resultKnown: true, text: record.summary! };
    await port.progress(`Group task round ${record.round + 1}`);
    const effectiveInput = studioGroupSteeredInput(input, record.steering?.summary);
    const results = await studioGroupTasks(
      record.tasks,
      record.round,
      context,
      effectiveInput,
      port,
    );
    if (hasStudioGroupSteering(port)) continue;
    const reviewResults = Object.fromEntries(
      Object.entries(results).map(([id, result]) => [
        id,
        { ...result, text: result.text.slice(0, STUDIO_GROUP_LIMITS.outputChars) },
      ]),
    );
    const review: StudioGroupReview = await studioGroupHostJson(
      group,
      port,
      `group:review:${record.round}`,
      studioGroupReviewPrompt(group, context, effectiveInput, reviewResults, record.round),
      (text) => parseStudioGroupReview(text, group),
    );
    if (port.signal.aborted) return workflowStopped(port.signal);
    if (hasStudioGroupSteering(port)) continue;
    await port.saveCheckpoint({ completedRounds: record.round + 1 });
    if (port.signal.aborted) return workflowStopped(port.signal);
    if (hasStudioGroupSteering(port)) continue;
    if (review.status === "complete") {
      // 主持声明不能把明确失败的派发变成完成；必须给出修订计划或诚实停止。
      if (Object.values(results).some((result) => result.status !== "succeeded"))
        return workflowFailed("The host claimed completion while assigned tasks still failed.");
      record = { ...record, phase: "complete", summary: review.summary };
      await port.saveCheckpoint({ plan: record });
      // 保存期间也可能收到插话；再次经过 inbox 边界，不能直接交付旧结论。
      continue;
    }
    record = {
      ...record,
      round: record.round + 1,
      tasks: review.tasks,
      dispatched: record.dispatched + review.tasks.length,
      phase: "tasks",
    };
    await port.saveCheckpoint({ plan: record });
  }
}

async function steer(
  group: StudioGroupDefinition,
  input: string,
  context: string,
  record: GroupCheckpoint,
  port: StudioExecutionPort,
): Promise<GroupCheckpoint> {
  if (record.phase !== "steering") {
    const messages = snapshotStudioGroupSteering(port);
    if (!messages.length) return record;
    record = {
      ...record,
      phase: "steering",
      steering: {
        revision: (record.steering?.revision ?? 0) + 1,
        summary: record.steering?.summary ?? "",
        pending: messages,
      },
    };
    // 原生主持回执可能先于 plan 提交；先固定输入，恢复时才不会用新消息匹配旧回执。
    await port.saveCheckpoint({ plan: record });
  }
  if (port.signal.aborted) throw new GroupStepFailure(workflowStopped(port.signal));
  const state = record.steering!;
  const revised = await studioGroupHostJson(
    group,
    port,
    `group:steering:${state.revision}`,
    studioGroupSteeringPrompt(
      group,
      context,
      input,
      state.summary,
      state.pending!,
      record.tasks,
      studioGroupSteeringResults(record, port),
    ),
    (text) => parseStudioGroupSteeringPlan(text, group),
  );
  if (port.signal.aborted) throw new GroupStepFailure(workflowStopped(port.signal));
  const next: GroupCheckpoint = {
    ...record,
    round: record.round + 1,
    tasks: revised.tasks,
    dispatched: record.dispatched + revised.tasks.length,
    phase: "tasks",
    steering: {
      revision: state.revision,
      summary: revised.steeringSummary,
      acknowledge: state.pending!.map((message) => message.id),
    },
  };
  await port.saveCheckpoint({ plan: next });
  return next;
}

export async function executeStudioGroup(
  definition: StudioGroupDefinition,
  input: string,
  taskMode: boolean,
  history: string,
  port: StudioExecutionPort,
): Promise<StudioStepResult> {
  if (port.signal.aborted) return workflowStopped(port.signal);
  const issues = validateStudioGroup(definition);
  if (issues.length) return workflowFailed(issues.join("\n"));
  const context = studioGroupContext(definition, history);
  if (!taskMode) {
    try {
      return await manual(definition, input, context, port);
    } catch (error) {
      return workflowFailed(error);
    }
  }
  try {
    return await task(definition, input, context, port);
  } catch (error) {
    return error instanceof GroupStepFailure
      ? error.result
      : port.signal.aborted
        ? workflowStopped(port.signal)
        : workflowFailed(error);
  }
}
