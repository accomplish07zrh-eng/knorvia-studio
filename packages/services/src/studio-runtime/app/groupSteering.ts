import type { StudioExecutionPort } from "./ports.js";
import type { StudioGroupDefinition, StudioStepResult } from "../workflowTypes.js";
import {
  parseStudioGroupPlan,
  STUDIO_GROUP_LIMITS,
  type StudioGroupTask,
} from "../domain/groupPolicy.js";

export interface GroupSteeringMessage {
  id: string;
  text: string;
}
interface GroupSteeringState {
  revision: number;
  summary: string;
  pending?: GroupSteeringMessage[];
  acknowledge?: string[];
}
export interface GroupCheckpoint {
  version: 1;
  round: number;
  tasks: StudioGroupTask[];
  dispatched: number;
  phase: "tasks" | "steering" | "complete";
  summary?: string;
  steering?: GroupSteeringState;
}
const BATCH_MESSAGES = 32;
const BATCH_CHARS = 48_000;
const SUMMARY_CHARS = 12_000;

function validMessage(message: GroupSteeringMessage): boolean {
  return (
    typeof message?.id === "string" &&
    message.id.length > 0 &&
    message.id.length <= 1024 &&
    typeof message.text === "string" &&
    message.text.trim().length > 0
  );
}
function pending(port: StudioExecutionPort): GroupSteeringMessage[] {
  if (Boolean(port.steering) !== Boolean(port.ackSteering))
    throw new Error("Group steering requires both a durable inbox and acknowledgement port.");
  return port.signal.aborted ? [] : (port.steering?.() ?? []);
}
export function hasStudioGroupSteering(port: StudioExecutionPort): boolean {
  return pending(port).length > 0;
}
export function snapshotStudioGroupSteering(port: StudioExecutionPort): GroupSteeringMessage[] {
  const result: GroupSteeringMessage[] = [];
  let size = 0;
  for (const message of pending(port)) {
    if (!validMessage(message)) throw new Error("Invalid group steering message.");
    const duplicate = result.find((item) => item.id === message.id);
    if (duplicate) {
      if (duplicate.text !== message.text) throw new Error("Conflicting group steering identity.");
      continue;
    }
    // 只限制一次主持上下文；后续消息保留在 owner inbox，不形成累计任务预算。
    if (
      result.length &&
      (result.length >= BATCH_MESSAGES || size + message.text.length > BATCH_CHARS)
    )
      break;
    result.push({ id: message.id, text: message.text });
    size += message.text.length;
  }
  return result;
}
export function savedStudioGroupPlan(
  group: StudioGroupDefinition,
  port: StudioExecutionPort,
): GroupCheckpoint | undefined {
  const value = port.checkpoint.plan;
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) throw new Error("Invalid saved group plan.");
  const record = value as GroupCheckpoint;
  if (
    record.version !== 1 ||
    !Number.isSafeInteger(record.round) ||
    record.round < 0 ||
    !Number.isSafeInteger(record.dispatched) ||
    record.dispatched < 1 ||
    !["tasks", "steering", "complete"].includes(record.phase) ||
    (record.phase === "complete" && typeof record.summary !== "string")
  )
    throw new Error("Invalid saved group plan.");
  const state = record.steering;
  if (
    state &&
    (!Number.isSafeInteger(state.revision) ||
      state.revision < 1 ||
      typeof state.summary !== "string" ||
      state.summary.length > SUMMARY_CHARS ||
      (state.pending !== undefined &&
        (!Array.isArray(state.pending) ||
          !state.pending.length ||
          state.pending.length > BATCH_MESSAGES ||
          state.pending.some((item) => !validMessage(item)) ||
          new Set(state.pending.map((item) => item.id)).size !== state.pending.length)) ||
      (state.acknowledge !== undefined &&
        (!Array.isArray(state.acknowledge) ||
          state.acknowledge.length > BATCH_MESSAGES ||
          state.acknowledge.some((id) => typeof id !== "string" || !id))))
  )
    throw new Error("Invalid saved group steering state.");
  if ((record.phase === "steering") !== Boolean(state?.pending?.length))
    throw new Error("Saved group steering batch does not match its phase.");
  return {
    ...record,
    tasks: parseStudioGroupPlan(JSON.stringify({ tasks: record.tasks }), group).tasks,
  };
}

export async function acknowledgeStudioGroupSteering(
  record: GroupCheckpoint,
  port: StudioExecutionPort,
): Promise<GroupCheckpoint> {
  const ids = record.steering?.acknowledge;
  if (!ids?.length || port.signal.aborted) return record;
  if (!port.ackSteering)
    throw new Error("Cannot acknowledge saved group steering without its owner.");
  // 新 plan 已经落盘才会存在 acknowledge；崩溃重入只重试这些 IDs，不再次规划。
  await port.ackSteering(ids);
  if (port.signal.aborted) return record;
  const next = { ...record, steering: { ...record.steering!, acknowledge: [] } };
  await port.saveCheckpoint({ plan: next });
  return next;
}

export function studioGroupSteeringResults(
  record: GroupCheckpoint,
  port: StudioExecutionPort,
): Record<string, unknown> {
  return Object.fromEntries(
    record.tasks.map((task) => {
      const result: StudioStepResult | undefined =
        port.checkpoint.steps[`group:round:${record.round}:task:${task.id}`];
      return [
        task.id,
        result
          ? { ...result, text: result.text.slice(0, STUDIO_GROUP_LIMITS.outputChars) }
          : { status: "not-dispatched", instruction: task.instruction },
      ];
    }),
  );
}

export function parseStudioGroupSteeringPlan(text: string, group: StudioGroupDefinition) {
  const plan = parseStudioGroupPlan(text, group);
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text);
  const value = JSON.parse(fenced?.[1] ?? text) as { steeringSummary?: unknown };
  if (
    typeof value.steeringSummary !== "string" ||
    !value.steeringSummary.trim() ||
    value.steeringSummary.length > SUMMARY_CHARS
  )
    throw new Error(
      "Steering plan requires a meaningful steeringSummary of at most 12000 characters.",
    );
  return { ...plan, steeringSummary: value.steeringSummary };
}
