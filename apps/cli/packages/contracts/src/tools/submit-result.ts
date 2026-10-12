// SPDX-License-Identifier: Apache-2.0
// submit_result 工具声明：工作流 actor（子 AgentRuntime）提交本次 ask 的结构化结果。
// 输入声明保持通用（只有一个 `result` 属性）：每个 ask 的具体 schema 不进工具声明，而是随
// ask 指令消息的 epilogue 下发，以维持 frozen-per-actor 的工具缓存不变式。
import { z } from "zod";
import { TOOL_JSON_SCHEMA_VERSION, toToolJsonSchema } from "./json-schema.js";

export const SUBMIT_RESULT_TOOL_NAME = "submit_result";

export const SubmitResultInputSchema = z
  .object({
    // 有意保持通用：不约束 result 的形状。per-ask schema 在 ask 指令 epilogue 里，由引擎在
    // WorkflowSubmitPort 侧校验；这样工具声明可以跨 ask 冻结、命中 prompt 缓存。
    result: z
      .unknown()
      .describe(
        "The structured result for this ask, matching the JSON schema given in the ask instructions.",
      ),
  })
  .strict();

export type SubmitResultInput = z.infer<typeof SubmitResultInputSchema>;

export const SubmitResultInputJsonSchema = toToolJsonSchema(SubmitResultInputSchema);

// mono 子代理的 typed 工具声明：`result` 的子 schema 就是该 actor 唯一的 ask 结果 schema。
// 运行时 zod 校验仍是上面的通用 `SubmitResultInputSchema`——per-ask 形状由引擎在
// WorkflowSubmitPort 侧校验，工具声明只是让 provider 看到（并在支持时原生约束）它。
// 外层对象与通用声明同形：单个必填 `result`、禁止多余键。
// JSON schema 里对象类型的取值；写成常量便于与快照对照。
const OBJECT_TYPE_KEYWORD = "object";

export function typedSubmitResultInputSchema(
  resultSchema: Record<string, unknown>,
): Record<string, unknown> {
  const resultProperty: Record<string, unknown> = {
    description: "The structured result for this ask.",
    ...resultSchema,
  };
  // 键序（= 插入序）必须与 core 的冻结快照一致：type → properties → required →
  // additionalProperties → $schema。逐个赋值正好保证这个顺序，也不必与上游逐行同形。
  const toolSchema: Record<string, unknown> = {};
  toolSchema.type = OBJECT_TYPE_KEYWORD;
  toolSchema.properties = { result: resultProperty };
  toolSchema.required = ["result"];
  toolSchema.additionalProperties = false;
  toolSchema.$schema = TOOL_JSON_SCHEMA_VERSION;
  return toolSchema;
}

export const SubmitResultOutputSchema = z
  .object({
    status: z.literal("accepted"),
  })
  .strict();

export type SubmitResultOutput = z.infer<typeof SubmitResultOutputSchema>;

export const SubmitResultOutputJsonSchema = toToolJsonSchema(SubmitResultOutputSchema);
