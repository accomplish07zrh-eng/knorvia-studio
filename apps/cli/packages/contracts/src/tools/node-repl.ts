// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

const LIMITS = { titleLength: 120, timeoutMs: 120_000 } as const;
const title = z
  .string()
  .min(1)
  .max(LIMITS.titleLength)
  .describe(
    "Name the intended action briefly in the user's language. This title is required for new calls; avoid implementation labels such as js, JavaScript or node_repl.",
  );
const timeout = z
  .number()
  .int()
  .positive()
  .max(LIMITS.timeoutMs)
  .optional()
  .describe(
    "Execution budget in milliseconds. For work expected to exceed 30000 ms, supply this field explicitly and include every awaited operation. Allow the estimated duration plus 15000 ms; divide the task into separate calls if it cannot fit within 120000 ms.",
  );

// 历史调用的标题可缺；新调用从同一对象收紧这一字段，其他校验和对象组合 API 保持一致。
// 这里只定义数据，不承诺 core 持久会话与 MCP 隔离执行具有相同生命周期。
export const JsRuntimeInputSchema = z
  .object({
    code: z
      .string()
      .describe(
        "JavaScript source for this call; the selected tool defines the execution lifetime.",
      ),
    timeout_ms: timeout,
    title: title.optional(),
  })
  .strict();
export const JsInputSchema = JsRuntimeInputSchema.required({ title: true });
export type JsRuntimeInput = z.infer<typeof JsRuntimeInputSchema>;
export type JsInput = z.infer<typeof JsInputSchema>;

const failure = z.object({ name: z.string(), message: z.string(), stack: z.string().optional() });
const image = z.object({ base64: z.string(), mimeType: z.string() }).strict();

export const JsOutputSchema = z
  .object({
    result: z.string().optional(),
    logs: z.string(),
    error: failure.optional(),
    images: z.array(image).optional(),
    browserScreenshotPaths: z.array(z.string()).optional(),
    responseMeta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type JsOutput = z.infer<typeof JsOutputSchema>;

export const JsInputJsonSchema = toToolJsonSchema(JsInputSchema);
export const JsOutputJsonSchema = toToolJsonSchema(JsOutputSchema);
