import type { StudioExecutionPort } from "./ports.js";
import type { StudioGroupDefinition, StudioStepResult } from "../workflowTypes.js";
import { STUDIO_GROUP_LIMITS, type StudioGroupTask } from "../domain/groupPolicy.js";
import { studioGroupTaskPrompt } from "../domain/groupPrompts.js";
import { workflowFailed, workflowStopped, workflowUnknown } from "./workflowSteps.js";
import { studioStepReference } from "../domain/stepReference.js";
import { hasStudioGroupSteering } from "./groupSteering.js";

export class GroupStepFailure extends Error {
  constructor(readonly result: StudioStepResult) {
    super(result.error ?? result.text ?? "Group execution stopped.");
  }
}
export async function studioGroupCall(
  port: StudioExecutionPort,
  step: Parameters<StudioExecutionPort["agent"]>[0],
): Promise<StudioStepResult> {
  if (port.signal.aborted) return workflowStopped(port.signal);
  if (step.signal?.aborted) return workflowStopped(step.signal);
  try {
    const result = await port.agent({
      ...step,
      signal: step.signal ? AbortSignal.any([port.signal, step.signal]) : port.signal,
    });
    if (!result.resultKnown || result.status === "interrupted")
      return { ...result, status: "interrupted", resultKnown: false };
    return port.signal.aborted ? workflowStopped(port.signal) : result;
    // 已调用内核后的异常不是“已安全取消”；只有适配器明确返回已知取消才能如此结算。
  } catch (error) {
    return workflowUnknown(error);
  }
}

export async function studioGroupHostJson<T>(
  group: StudioGroupDefinition,
  port: StudioExecutionPort,
  id: string,
  prompt: string,
  parse: (text: string) => T,
): Promise<T> {
  let correction = "";
  for (let response = 0; response < STUDIO_GROUP_LIMITS.hostResponses; response++) {
    const result = await studioGroupCall(port, {
      id: `${id}:response:${response}`,
      memberId: group.host,
      kernel: group.host,
      prompt: prompt + correction,
    });
    if (result.status !== "succeeded") throw new GroupStepFailure(result);
    try {
      return parse(result.text);
    } catch (error) {
      const diagnostic = error instanceof Error ? error.message : String(error);
      if (response + 1 === STUDIO_GROUP_LIMITS.hostResponses)
        throw new GroupStepFailure(
          workflowFailed(`Host returned invalid structured output: ${diagnostic}`),
        );
      correction = `\n\nYour previous response was rejected: ${diagnostic}\nReturn a corrected JSON object only. Previous response:\n${result.text.slice(0, 24_000)}`;
      await port.progress("The host is correcting an invalid task plan.");
    }
  }
  throw new GroupStepFailure(workflowFailed("Host structured response budget exhausted."));
}

export async function studioGroupTasks(
  tasks: StudioGroupTask[],
  round: number,
  context: string,
  input: string,
  port: StudioExecutionPort,
): Promise<Record<string, StudioStepResult>> {
  const output: Record<string, StudioStepResult> = Object.create(null) as Record<
    string,
    StudioStepResult
  >;
  const running = new Map<string, Promise<void>>();
  const runningMembers = new Set<string>();
  const stop = new AbortController();
  let fatal: StudioStepResult | undefined;
  try {
    while (Object.keys(output).length < tasks.length) {
      if (port.signal.aborted || stop.signal.aborted || hasStudioGroupSteering(port)) break;
      let advanced = false;
      for (const task of tasks) {
        // 插话只冻结尚未派发的步骤；已在写入的成员由 finally 收口，不发 abort。
        if (port.signal.aborted || stop.signal.aborted || hasStudioGroupSteering(port)) break;
        if (
          Object.hasOwn(output, task.id) ||
          running.has(task.id) ||
          (port.steering && runningMembers.has(task.member)) ||
          task.dependsOn.some((id) => !Object.hasOwn(output, id))
        )
          continue;
        if (task.dependsOn.some((id) => output[id]!.status !== "succeeded")) {
          output[task.id] = workflowFailed(
            "A declared dependency failed; this task was not dispatched.",
          );
          advanced = true;
          continue;
        }
        // 同一原生会话尚未空闲时不预排下一步，避免内核队列绕过后续插话检查。
        runningMembers.add(task.member);
        const dependencies = Object.fromEntries(
          task.dependsOn.map((id) => [id, studioStepReference(output[id])]),
        );
        const promise = studioGroupCall(port, {
          id: `group:round:${round}:task:${task.id}`,
          kernel: task.member,
          memberId: task.member,
          signal: stop.signal,
          prompt: studioGroupTaskPrompt(context, input, task, dependencies),
        })
          .then((result) => {
            output[task.id] = result;
            if (!result.resultKnown || result.status === "interrupted") {
              fatal = result;
              stop.abort(new Error("A member has an unknown result."));
            } else if (result.status === "cancelled" && !stop.signal.aborted) {
              fatal ??= result;
              stop.abort(new Error("A group member was cancelled."));
            } else if (result.status === "failed" && result.retryable === false) {
              fatal ??= result;
              stop.abort(new Error("A group member failed and must not be retried."));
            }
          })
          .finally(() => {
            running.delete(task.id);
            runningMembers.delete(task.member);
          });
        running.set(task.id, promise);
        advanced = true;
      }
      if (running.size) await Promise.race(running.values());
      else if (!advanced) throw new Error("Group task dependencies cannot progress.");
    }
  } finally {
    await Promise.all(running.values());
  }
  if (fatal) throw new GroupStepFailure(fatal);
  if (port.signal.aborted) throw new GroupStepFailure(workflowStopped(port.signal));
  return output;
}
