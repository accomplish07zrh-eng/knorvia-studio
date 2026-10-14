// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 动态 section：会话指导、动态行为边界、输出风格与上下文管理四段，文案见 dynamic-sections-texts。
import type { ContextBuilderConfig, ContextSection } from "./types.js";
import { contextSectionFromText } from "./sections/section-core.js";
import {
  AUTONOMY_GUIDANCE,
  CODE_COMMENT_BOUNDARY,
  CODE_STYLE_MATCHING,
  COMMUNICATION_GUIDANCE,
  CONTEXT_MANAGEMENT_NOTE,
  CONTEXT_MANAGEMENT_TITLE,
  DYNAMIC_BEHAVIOR_BOUNDARY,
  OUTPUT_STYLE_TITLE_PREFIX,
  SESSION_GUIDANCE_TITLE,
  SKILL_INVOCATION_GUIDANCE,
} from "./dynamic-sections-texts.js";

/** 四段都注入 system，并且都标记为动态（内容随会话上下文变化）。 */
const dynamicSection = (
  name: string,
  source: ContextSection["source"],
  content: string,
): ContextSection => contextSectionFromText(name, source, "system", "dynamic", content);

/** 会话指导：只有确实有内容时才出段，避免注入一个空标题。 */
export const buildSessionGuidanceSection = (
  toolNames: readonly string[],
  hasSkills = false,
): ContextSection | null => {
  const available = new Set(toolNames);
  const guidance: string[] = [];
  // 目前只放 Skill 一句：Agent / AskUserQuestion 两段暂不输出。
  if (available.has("Skill") && hasSkills) {
    guidance.push(SKILL_INVOCATION_GUIDANCE);
  }
  if (guidance.length === 0) return null;
  const lines = [SESSION_GUIDANCE_TITLE, ...guidance];
  return dynamicSection("Session-specific guidance", "session_guidance", lines.join("\n"));
};

/** 动态行为边界：沟通规范 + 代码风格 + 注释边界 + 不可逆动作的确认要求。 */
export const buildDynamicBehaviorSection = (): ContextSection =>
  dynamicSection(
    "Dynamic Behavior",
    "dynamic_behavior",
    [
      COMMUNICATION_GUIDANCE,
      "",
      CODE_STYLE_MATCHING,
      CODE_COMMENT_BOUNDARY,
      "",
      DYNAMIC_BEHAVIOR_BOUNDARY,
    ].join("\n"),
  );

/** 输出风格：名称为空或提示词全空白时不出段。 */
export const buildOutputStyleSection = (
  style: ContextBuilderConfig["outputStyle"],
): ContextSection | null => {
  const prompt = style?.prompt.trim() ?? "";
  if (!style || prompt.length === 0) return null;
  const content = OUTPUT_STYLE_TITLE_PREFIX + style.name + "\n" + prompt;
  return dynamicSection("Output Style", "output_style", content);
};

/** 上下文管理：标题 + 摘要说明 + 长会话自主性规范。 */
export const buildContextManagementSection = (): ContextSection =>
  dynamicSection(
    "Context Management",
    "context_management",
    [CONTEXT_MANAGEMENT_TITLE + "\n" + CONTEXT_MANAGEMENT_NOTE, "", AUTONOMY_GUIDANCE].join("\n"),
  );
