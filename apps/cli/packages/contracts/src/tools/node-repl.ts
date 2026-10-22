// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// `node_repl` 工具的输入/输出 schema。
//
// 输入分两档：`JsRuntimeInputSchema` 允许缺标题（历史调用的回放形态），
// `JsInputSchema` 在同一对象上把标题收紧为必填 —— 两者共用其余校验，
// 所以只写一份字段定义、再 derive 出严格版。
//
// 输出里 `logs` 恒有（哪怕是空串），`result` / `error` / `images` /
// `browserScreenshotPaths` / `responseMeta` 都是可选；`.strict()` 拒绝多余字段。
//
// 这里只定义数据结构，不承诺 core 的持久会话与 MCP 隔离执行共享同一生命周期。

import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

/** 两个上限：标题长度与单次执行预算（毫秒）。 */
const LIMITS = { titleLength: 120, timeoutMs: 120_000 } as const;

/** 标题：必填文本，长度上限 120；文案要求「用用户语言简述意图」，避免实现类标签。 */
const titleField = z
  .string()
  .min(1)
  .max(LIMITS.titleLength)
  .describe(
    "Name the intended action briefly in the user's language. This title is required for new calls; avoid implementation labels such as js, JavaScript or node_repl.",
  );

/** 超时：可选的正整数毫秒，上限 120000；文案给出「估算 + 15000ms」的取值建议。 */
const timeoutField = z
  .number()
  .int()
  .positive()
  .max(LIMITS.timeoutMs)
  .optional()
  .describe(
    "Execution budget in milliseconds. For work expected to exceed 30000 ms, supply this field explicitly and include every awaited operation. Allow the estimated duration plus 15000 ms; divide the task into separate calls if it cannot fit within 120000 ms.",
  );

/** 失败信息：名字与文案必填，栈可选（不同运行时可能不给栈）。 */
const failureShape = z.object({
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
});

/** 一张图片：base64 数据与 MIME 类型，拒绝多余字段。 */
const imageShape = z.object({ base64: z.string(), mimeType: z.string() }).strict();

/** 运行时输入：允许缺标题。 */
export const JsRuntimeInputSchema = z
  .object({
    code: z
      .string()
      .describe(
        "JavaScript source for this call; the selected tool defines the execution lifetime.",
      ),
    timeout_ms: timeoutField,
    title: titleField.optional(),
  })
  .strict();

/** 新调用的输入：在运行时输入上把标题收紧为必填。 */
export const JsInputSchema = JsRuntimeInputSchema.required({ title: true });

export type JsRuntimeInput = z.infer<typeof JsRuntimeInputSchema>;
export type JsInput = z.infer<typeof JsInputSchema>;

/** 输出：`logs` 恒有，其余可选；拒绝多余字段。 */
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

/** 给工具层用的 JSON Schema 形态。 */
export const JsInputJsonSchema = toToolJsonSchema(JsInputSchema);
export const JsOutputJsonSchema = toToolJsonSchema(JsOutputSchema);
