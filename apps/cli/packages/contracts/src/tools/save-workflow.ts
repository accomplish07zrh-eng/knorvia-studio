// SPDX-License-Identifier: Apache-2.0
// SaveWorkflow 工具声明：把一段 dwf 脚本连同元数据保存成可复用的工作流定义。

import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";
import { CreateWorkflowDiagnosticSchema } from "./create-workflow.js";
import {
  SAVED_WORKFLOW_MAX_NAME_CHARS,
  SavedWorkflowArgsDeclarationSchema,
  SavedWorkflowScopeSchema,
  SavedWorkflowShadowingSchema,
} from "./saved-workflow.js";

export const SAVE_WORKFLOW_TOOL_NAME = "SaveWorkflow";

// 「恰好给一个正文来源」的违规说明。输入侧字段刻意不叫 path：path 在本工具里已经是解析回填的
// 落点（确认窗与 UI 读它），同一个名字既当输入又当输出，会让模型把保存目标误当源文件传进来。
export const SAVE_WORKFLOW_SOURCE_ERROR =
  "Provide exactly one script source: `script` for the body inline, or `script_path` for the file holding it (a draft, usually). Passing both, or neither, is ambiguous.";

// 模型把「自带 frontmatter 的脚本」直接传进来时的业务失败说明。
export const SAVE_WORKFLOW_SENTINEL_IN_SCRIPT_ERROR =
  "The `script` must be the workflow body only — it already starts with a `/* knorvia-workflow` metadata block. Pass the metadata through the `description` / `whenToUse` / `args` fields instead; the block is written for you.";

export const SaveWorkflowInputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(SAVED_WORKFLOW_MAX_NAME_CHARS)
      .describe(
        "File-safe identifier the workflow will be recalled by. Letters, digits, dot, dash and underscore only.",
      ),
    description: z
      .string()
      .min(1)
      .describe("One line saying what the workflow does. Shown wherever the workflow is listed."),
    whenToUse: z
      .string()
      .min(1)
      .optional()
      .describe("Optional guidance on the situations this workflow is the right answer to."),
    args: SavedWorkflowArgsDeclarationSchema.optional().describe(
      "Optional argument declarations. The script reads validated values off the `args` global.",
    ),
    script: z
      .string()
      .optional()
      .describe(
        "Full TypeScript workflow script written against the dynamic-workflow facade, exactly as CreateWorkflow takes it. Body only — do not include a metadata block. Provide this OR `script_path`, never both.",
      ),
    // 正文的第二个来源：盘上已有的文件（通常是刚跑过的草稿）。文件若自带元数据块，
    // 该块会被丢弃——元数据以本次调用的字段为准，用户批准的是这些字段而不是文件里那份。
    script_path: z
      .string()
      .min(1)
      .optional()
      .describe(
        "The file holding the script body, relative to the working directory or absolute — usually a draft a CreateWorkflow/AmendWorkflow result named. Provide this OR `script`, never both; it saves a working draft without re-emitting it. A `/* knorvia-workflow` block in that file is dropped: the metadata comes from this call's `description` / `whenToUse` / `args`.",
      ),
    // 作用域必须由模型显式给出，不给默认值：判据是「脚本有没有引用本仓库的东西」，
    // 有 → project，没有 → global，系统不做猜测。
    scope: SavedWorkflowScopeSchema.describe(
      'Where the workflow is saved. "project" when the script references this repository\'s files, commands, conventions or directory layout; "global" when it depends on nothing in this project and should be available from every project (saved under ~/.knorvia-studio/workflows). Decide every time; there is no default.',
    ),
    // 下面三个字段由 resolveInput 解析并回填，模型不填。
    // 它们是要在确认窗展示的事实：这次保存落到哪个文件、是否覆盖、是否遮蔽了另一档。
    // 放在入参而不是 display：入参通道对各客户端版本都是无 schema 透传，
    // 旧桌面与 legacy v3 也能拿到完整内容。
    // 解析回填：文件落点。
    path: z.string().min(1).optional(),
    // 解析回填：目标已存在，本次批准的是一次覆盖写入。
    overwrite: z.boolean().optional(),
    // 解析回填：另一档已有同名定义（遮蔽事实，供确认窗展示）；缺席表示没有同名。
    shadowing: SavedWorkflowShadowingSchema.optional(),
  })
  .strict();

export type SaveWorkflowInput = z.infer<typeof SaveWorkflowInputSchema>;

export const SaveWorkflowInputJsonSchema = toToolJsonSchema(SaveWorkflowInputSchema);

// 输出与 CreateWorkflow 的诊断共用同一个 schema：两个工具跑的是同一个类型检查器，
// 让模型在两处看到形状不同的诊断，只会教它写两套解析逻辑。
// overwritten 只在真的写了文件时出现：纯诊断结果谈不上「有没有覆盖」，
// 补一个 false 反而会让模型以为已经落盘成功。
export const SaveWorkflowOutputSchema = z
  .object({
    diagnostics: z.array(CreateWorkflowDiagnosticSchema),
    ok: z.boolean(),
    response: z.string(),
    name: z.string().min(1),
    scope: SavedWorkflowScopeSchema,
    // 文件落点；未能写成时给出本该写到的位置，便于模型把错误讲清楚。
    path: z.string().min(1),
    overwritten: z.boolean().optional(),
  })
  .strict();

export type SaveWorkflowOutput = z.infer<typeof SaveWorkflowOutputSchema>;

export const SaveWorkflowOutputJsonSchema = toToolJsonSchema(SaveWorkflowOutputSchema);
