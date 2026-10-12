// SPDX-License-Identifier: Apache-2.0
// Skill 工具声明：按需加载本地可复用的指令包（技能）。

import { z } from "zod";
import type { ToolCallId, TraceId } from "../interfaces/shared.js";
import { toToolJsonSchema } from "./json-schema.js";

const SKILL_NAME_DESCRIPTION =
  "The name of a skill from the available-skills list. Do not guess names.";

const SkillCurrentInputSchema = z.object({
  skill: z.string().describe(SKILL_NAME_DESCRIPTION),
  args: z.string().optional().describe("Optional arguments for the skill"),
});

const LegacySkillInputSchema = z.object({
  name: z.string().min(1),
  args: z.string().optional(),
});

export const SkillInputSchema = z
  .union([SkillCurrentInputSchema, LegacySkillInputSchema])
  .transform((input) => ({
    args: input.args,
    skill: "skill" in input ? input.skill : input.name,
  }));

export type SkillInput = z.infer<typeof SkillCurrentInputSchema>;
export type SkillRuntimeInput = z.infer<typeof SkillInputSchema>;

export const SkillInputJsonSchema = toToolJsonSchema(SkillCurrentInputSchema);

export interface SkillStructuredOutput {
  name: string;
  content: string;
  baseDirectory: string;
  truncated: boolean;
}

export type SkillOutput = string | SkillStructuredOutput;

export const SkillStructuredOutputSchema = z
  .object({
    name: z.string(),
    content: z.string(),
    baseDirectory: z.string(),
    truncated: z.boolean(),
  })
  .strict();

export const SkillOutputSchema = z.union([z.string(), SkillStructuredOutputSchema]);

export const SkillOutputJsonSchema = toToolJsonSchema(SkillOutputSchema);

export interface SkillToolCall {
  id: ToolCallId;
  name: "Skill";
  input: SkillInput;
  traceId: TraceId;
  startedAt: Date;
}

export interface SkillToolResult {
  toolCallId: ToolCallId;
  output: SkillOutput;
  traceId: TraceId;
  durationMs: number;
}
