// SPDX-License-Identifier: Apache-2.0
// TaskStop 的声明面：停掉一个后台任务（按 task_id；shell_id 只是旧拼写的兼容入口）。
import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const TASK_STOP_TOOL_NAME = "TaskStop";

// 两个字段都可选：工具层要能接住「只给了旧 shell_id」的调用并按兼容路径处理。
export const TaskStopInputSchema = z
  .object({
    task_id: z.string().optional().describe("The ID of the background task to stop"),
    shell_id: z.string().optional().describe("Deprecated: use task_id instead"),
  })
  .strict();

export type TaskStopInput = z.infer<typeof TaskStopInputSchema>;

export const TaskStopInputJsonSchema = toToolJsonSchema(TaskStopInputSchema);

// 停止回执报出实际被停的任务与其类型；command 只在后台命令任务上有值。
export const TaskStopOutputSchema = z
  .object({
    message: z.string(),
    task_id: z.string(),
    task_type: z.string(),
    command: z.string().optional(),
  })
  .strict();

export type TaskStopOutput = z.infer<typeof TaskStopOutputSchema>;

export const TaskStopOutputJsonSchema = toToolJsonSchema(TaskStopOutputSchema);
