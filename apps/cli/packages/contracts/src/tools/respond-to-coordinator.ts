// SPDX-License-Identifier: Apache-2.0
// RespondToCoordinator 的声明面：子代理把一段简述加一段正文回给协调者。
import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const RESPOND_TO_COORDINATOR_TOOL_NAME = "RespondToCoordinator";
// 正文上限与会话里其它「大段文本」参数同量级：够写完整结论，又不至于把一次回复
// 撑成新的上下文负担。
export const RESPOND_TO_COORDINATOR_MAX_CONTENT_CHARS = 20_000;

// summary 是列表里的预览，刻意压到 200 字符；正文才承载结论本身。
export const RespondToCoordinatorInputSchema = z
  .object({
    summary: z.string().min(1).max(200).describe("Short summary of the response."),
    message: z
      .string()
      .min(1)
      .max(RESPOND_TO_COORDINATOR_MAX_CONTENT_CHARS)
      .describe("Response or progress update for the coordinator."),
  })
  .strict();

export type RespondToCoordinatorInput = z.infer<typeof RespondToCoordinatorInputSchema>;

export const RespondToCoordinatorInputJsonSchema = toToolJsonSchema(
  RespondToCoordinatorInputSchema,
);

// 回执只有成败两种状态；失败时 error 带上原因，成功时 responseId 指向已投递的回复。
export const RespondToCoordinatorOutputSchema = z
  .object({
    status: z.enum(["success", "failed"]),
    responseId: z.string(),
    message: z.string(),
    error: z.string().optional(),
  })
  .strict();

export type RespondToCoordinatorOutput = z.infer<typeof RespondToCoordinatorOutputSchema>;
