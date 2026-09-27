// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  RESPOND_TO_COORDINATOR_TOOL_NAME,
  RespondToCoordinatorOutputSchema,
  SEND_MESSAGE_TOOL_NAME,
  SendMessageOutputSchema,
  TASK_OUTPUT_TOOL_NAME,
  TaskOutputResultSchema,
  TASK_OUTPUT_DISPLAY_MAX_OUTPUT_CHARS,
  TASK_OUTPUT_DISPLAY_MAX_STATUS_CHARS,
  TASK_STOP_TOOL_NAME,
  TaskStopOutputSchema,
  type ToolResultDisplayPayload,
} from "@knorvia/contracts";
import { boundDisplayText } from "../display-text.js";

type Projector = (output: unknown) => ToolResultDisplayPayload | undefined;

const messageCard: Projector = (output) => {
  const result = SendMessageOutputSchema.safeParse(output);
  if (!result.success) return;
  const { status, error, message } = result.data;
  const card: Extract<ToolResultDisplayPayload, { kind: "local_agent_message" }> = {
    kind: "local_agent_message",
    status,
  };
  for (const [key, value] of [
    ["error", error],
    ["message", message],
  ] as const) {
    if (value !== undefined) card[key] = boundDisplayText(value, 4096).value;
  }
  return card;
};

const stopCard: Projector = (output) => {
  const result = TaskStopOutputSchema.safeParse(output);
  if (!result.success) return;
  const { command, message, task_id: taskId, task_type: taskType } = result.data;
  const summary = `Successfully stopped task: ${taskId}`;
  const duplicate = command !== undefined && message === `${summary} (${command})`;
  const fields = {
    command: command === undefined ? undefined : boundDisplayText(command, 16384),
    message: boundDisplayText(duplicate ? summary : message, 16384),
  };
  const card: Extract<ToolResultDisplayPayload, { kind: "task_stop" }> = {
    kind: "task_stop",
    taskId,
    taskType,
    ...(fields.command ? { command: fields.command.value } : {}),
    message: fields.message.value,
  };
  if (fields.command?.truncated || fields.message.truncated) card.truncated = true;
  return card;
};

const outputCard: Projector = (output) => {
  const result = TaskOutputResultSchema.safeParse(output);
  if (!result.success) return;
  const { task, retrieval_status: retrievalStatus } = result.data;
  const status = task?.status.trim().slice(0, TASK_OUTPUT_DISPLAY_MAX_STATUS_CHARS);
  const text = task?.output.trimEnd();
  const card: Extract<ToolResultDisplayPayload, { kind: "task_output" }> = {
    kind: "task_output",
    retrievalStatus,
  };
  if (status) card.taskStatus = status;
  if (text?.trim()) {
    card.output = text.slice(0, TASK_OUTPUT_DISPLAY_MAX_OUTPUT_CHARS);
    if (text.length > TASK_OUTPUT_DISPLAY_MAX_OUTPUT_CHARS) card.truncated = true;
  }
  return card;
};

const responseCard: Projector = (output) => {
  const result = RespondToCoordinatorOutputSchema.safeParse(output);
  return result.success
    ? { kind: "respond_to_coordinator", status: result.data.status }
    : undefined;
};

// 匹配名称即终止，schema 拒绝不能回退为另一类卡片；Map 不含原型属性名称。
export const taskCardProjectors: ReadonlyMap<string, Projector> = new Map([
  [SEND_MESSAGE_TOOL_NAME, messageCard],
  [TASK_STOP_TOOL_NAME, stopCard],
  [TASK_OUTPUT_TOOL_NAME, outputCard],
  [RESPOND_TO_COORDINATOR_TOOL_NAME, responseCard],
]);
