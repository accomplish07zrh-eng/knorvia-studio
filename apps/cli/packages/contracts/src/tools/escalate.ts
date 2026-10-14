// SPDX-License-Identifier: Apache-2.0
// escalate 工具声明：actor 把阻塞问题升级给主代理。
// 注入方式与 submit_result 同构（端口在场即注册，tools:"none" 下由 core 补回），区别在结算对象：
// submit_result 结算一次 ask 的结果，escalate 结算一次问答。
// 输出刻意做成「带判别位的扁平对象」而不是 union：两支都是普通工具结果而非错误，
// 模型只读到一段文本，判别位 status 仅服务日志与结果投影。

import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const ESCALATE_TOOL_NAME = "escalate";

export const EscalateInputSchema = z
  .object({
    question: z
      .string()
      .min(1)
      .describe(
        "The single focused question that unblocks you. One question per call, answerable in a sentence.",
      ),
    context: z
      .string()
      .optional()
      .describe(
        "What you already tried and where exactly you are stuck — the evidence the answerer needs.",
      ),
  })
  .strict();

export type EscalateInput = z.infer<typeof EscalateInputSchema>;

export const EscalateInputJsonSchema = toToolJsonSchema(EscalateInputSchema);

// 一次升级的结局有两种取值：
// answered 时 message 是主代理给出的答案原文，qid 是本次问答的全局唯一 id；
// refused 时 message 陈述现状与下一步（预算已尽 / 无在飞 ask），reason 是判别键。
// refused 不是错误：把「预算已尽」渲染成 error tool_result 会被模型当成可重试故障，
// 反复重试同一件事，而这正是升级机制要避免的行为。
export const EscalateOutputSchema = z
  .object({
    status: z.enum(["answered", "refused"]),
    message: z.string(),
    // 仅 answered 时在场。
    qid: z.string().optional(),
    // 仅 refused 时在场。
    reason: z.enum(["budget_exhausted", "no_active_ask"]).optional(),
  })
  .strict();

export type EscalateOutput = z.infer<typeof EscalateOutputSchema>;

export const EscalateOutputJsonSchema = toToolJsonSchema(EscalateOutputSchema);
