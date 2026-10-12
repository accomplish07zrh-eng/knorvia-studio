// SPDX-License-Identifier: Apache-2.0
// ReadSessionContext 的声明面：从**另一个**已持久化的会话里取回上下文，
// 取法分「按查询检索片段」与「交接摘要」两种。
import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const READ_SESSION_CONTEXT_TOOL_NAME = "ReadSessionContext";
export const READ_SESSION_CONTEXT_DEFAULT_MAX_TOKENS = 6000;
export const READ_SESSION_CONTEXT_MAX_TOKENS = 12000;

// 只认持久化会话的 id 形状；别的东西在进入检索前就被拒掉。
const SESSION_ID_PATTERN = /^sess_[A-Za-z0-9._-]+$/;

// 两种取法：按查询检索相关片段，或取一段有界的交接摘要。
export const ReadSessionContextStrategySchema = z.enum(["relevant", "handoff"]);

export const ReadSessionContextInputSchema = z
  .object({
    sessionId: z
      .string()
      .regex(SESSION_ID_PATTERN, "Session id must use the sess_* format.")
      .describe("Target Knorvia Studio session id to read from persisted session history."),
    query: z
      .string()
      .min(1)
      .max(4000)
      .describe(
        "Focused natural-language description of the context needed from the target session.",
      ),
    strategy: ReadSessionContextStrategySchema.optional()
      .default("relevant")
      .describe(
        "Use relevant for focused retrieval, or handoff for a bounded continuation summary.",
      ),
    maxTokens: z
      .number()
      .int()
      .positive()
      .max(READ_SESSION_CONTEXT_MAX_TOKENS)
      .optional()
      .describe("Approximate maximum tokens to return to the model."),
  })
  .strict();

export type ReadSessionContextInput = z.infer<typeof ReadSessionContextInputSchema>;

export const ReadSessionContextInputJsonSchema = toToolJsonSchema(ReadSessionContextInputSchema);

// 一条命中的引用：指向被读取会话里的某条消息（partId/index 只在片段级命中时在场），
// reason 说明它为什么被选中。
export const ReadSessionContextReferenceSchema = z
  .object({
    messageId: z.string(),
    partId: z.string().optional(),
    index: z.number().int().nonnegative().optional(),
    role: z.enum(["user", "assistant"]).optional(),
    reason: z.string().optional(),
  })
  .strict();

export type ReadSessionContextReference = z.infer<typeof ReadSessionContextReferenceSchema>;

// 取回来的结果：status 决定「读到了 / 没找到 / 失败」三条分支，source 记录内容来自哪种
// 检索通道，content 才是要回灌给模型的正文；messageCount 与 selectedMessageCount 分开报，
// 免得把「会话里有多少条」误读成「这次取了多少条」。
export const ReadSessionContextOutputSchema = z
  .object({
    status: z.enum(["success", "not_found", "failed"]),
    sessionId: z.string(),
    title: z.string().optional(),
    directory: z.string().optional(),
    path: z.string().optional(),
    strategy: ReadSessionContextStrategySchema,
    query: z.string(),
    source: z.enum(["lite", "local", "fallback", "none"]),
    content: z.string(),
    messageCount: z.number().int().nonnegative(),
    selectedMessageCount: z.number().int().nonnegative().optional(),
    truncated: z.boolean(),
    error: z.string().optional(),
    references: z.array(ReadSessionContextReferenceSchema).optional(),
  })
  .strict();

export type ReadSessionContextOutput = z.infer<typeof ReadSessionContextOutputSchema>;

export const ReadSessionContextOutputJsonSchema = toToolJsonSchema(ReadSessionContextOutputSchema);
