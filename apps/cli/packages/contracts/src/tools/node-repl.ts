// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

/**
 * 这个工具对外的两个上限。
 *
 * `titleLength` 约束人类可读标题的长度，`timeoutMs` 是单次执行的预算上限 ——
 * 两者都写在描述文案里给模型看，所以集中在这里，改一处即可同步。
 */
const LIMITS = {
  titleLength: 120,
  timeoutMs: 120_000,
} as const;

/**
 * 面向模型的字段说明。
 *
 * 文案单独放在一张表里：它们是需要推敲措辞的「提示词资产」，
 * 与「字段类型与校验」分开维护，改文案不会碰到结构。
 */
const FIELD_GUIDANCE = {
  title:
    "Name the intended action briefly in the user's language. This title is required for new calls; avoid implementation labels such as js, JavaScript or node_repl.",
  timeout:
    "Execution budget in milliseconds. For work expected to exceed 30000 ms, supply this field explicitly and include every awaited operation. Allow the estimated duration plus 15000 ms; divide the task into separate calls if it cannot fit within 120000 ms.",
  code: "JavaScript source for this call; the selected tool defines the execution lifetime.",
} as const;

/** 可复用的字段形态：标题（长度受限）、超时（正整数字面量，可缺省）。 */
const titleField = z.string().min(1).max(LIMITS.titleLength).describe(FIELD_GUIDANCE.title);

const timeoutField = z
  .number()
  .int()
  .positive()
  .max(LIMITS.timeoutMs)
  .optional()
  .describe(FIELD_GUIDANCE.timeout);

// 历史调用的标题可缺；新调用从同一对象收紧这一字段，其他校验和对象组合 API 保持一致。
// 这里只定义数据，不承诺 core 持久会话与 MCP 隔离执行具有相同生命周期。
export const JsRuntimeInputSchema = z
  .object({
    code: z.string().describe(FIELD_GUIDANCE.code),
    timeout_ms: timeoutField,
    title: titleField.optional(),
  })
  .strict();
export const JsInputSchema = JsRuntimeInputSchema.required({ title: true });
export type JsRuntimeInput = z.infer<typeof JsRuntimeInputSchema>;
export type JsInput = z.infer<typeof JsInputSchema>;

/** 执行失败时回传的结构：名字、消息、可选栈。 */
const failureShape = z.object({
  message: z.string(),
  name: z.string(),
  stack: z.string().optional(),
});

/** 一张随结果回传的图片。 */
const imageShape = z.object({ base64: z.string(), mimeType: z.string() }).strict();

export const JsOutputSchema = z
  .object({
    result: z.string().optional(),
    logs: z.string(),
    error: failureShape.optional(),
    images: z.array(imageShape).optional(),
    browserScreenshotPaths: z.array(z.string()).optional(),
    responseMeta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type JsOutput = z.infer<typeof JsOutputSchema>;

export const JsInputJsonSchema = toToolJsonSchema(JsInputSchema);
export const JsOutputJsonSchema = toToolJsonSchema(JsOutputSchema);
