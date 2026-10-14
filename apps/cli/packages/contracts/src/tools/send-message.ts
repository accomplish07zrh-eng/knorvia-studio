// SPDX-License-Identifier: Apache-2.0
// SendMessage 的声明面：本地代理之间的一对一消息投递（对端由 agent id 指定）。
import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const SEND_MESSAGE_TOOL_NAME = "SendMessage";
// 与 RespondToCoordinator 同一个正文量级：跨代理传的是结论，不是整段会话。
export const SEND_MESSAGE_MAX_CONTENT_CHARS = 20_000;

// to 与 summary 都封到 200 字符：前者是 agent id，后者是 UI 列表里的预览；
// 正文单独给足空间，三条都必填——没有收件人或多空正文的消息没有意义。
export const SendMessageInputSchema = z
  .object({
    to: z
      .string()
      .min(1)
      .max(200)
      .describe("Recipient: local agent ID returned by Agent (format agent_<uuid>)."),
    summary: z
      .string()
      .min(1)
      .max(200)
      .describe("A 5-10 word summary shown as a preview in the UI."),
    message: z
      .string()
      .min(1)
      .max(SEND_MESSAGE_MAX_CONTENT_CHARS)
      .describe("Plain text message content"),
  })
  .strict();

export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export const SendMessageInputJsonSchema = toToolJsonSchema(SendMessageInputSchema);

// 投递结果：delivery 说明对方当时处于什么状态（排队 / 被中途引导 / 从后台唤起），
// 其余字段按投递路径带出（后台任务带 outputFile/taskId，失败带 error）。
export const SendMessageOutputSchema = z
  .object({
    status: z.enum(["success", "failed"]),
    messageId: z.string(),
    agentId: z.string().optional(),
    delivery: z.enum(["queued", "steered", "resumed_background"]).optional(),
    error: z.string().optional(),
    message: z.string().optional(),
    outputFile: z.string().optional(),
    taskId: z.string().optional(),
  })
  .strict();

export type SendMessageOutput = z.infer<typeof SendMessageOutputSchema>;

export const SendMessageOutputJsonSchema = toToolJsonSchema(SendMessageOutputSchema);
