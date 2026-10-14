// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// builder 的装配管线：收集 section、按注入位置与缓存提示排序、组装 system messages 与
// meta user 附件。公开类 ContextBuilder 只做门面与参数校验，装配规则全部在这里。
import type { ContextBuildResult, ContextBuilderConfig, ContextSection } from "./types.js";
import { buildCliPrefixSection } from "./sections/cli-prefix.js";
import { buildIdentitySection } from "./sections/identity.js";
import { buildWorkflowActorIdentitySection } from "./sections/workflow-actor.js";
import { buildEnvInfoSection, buildGitSystemContextSection } from "./sections/env-info.js";
import { buildSkillsSection } from "./sections/skills.js";
import { buildRequestUserContextSection } from "./sections/request-user-context.js";
import { buildCurrentDateSection } from "./sections/current-date.js";
import { buildMemorySection } from "./sections/memory.js";
import { buildDesktopContextSection } from "./sections/desktop.js";
import {
  buildSessionGuidanceSection,
  buildDynamicBehaviorSection,
  buildOutputStyleSection,
  buildContextManagementSection,
} from "./dynamic-sections.js";
import { estimateTokens } from "./utils.js";

const CACHE_CONTROL: { type: "ephemeral" } = { type: "ephemeral" };

const CONTEXT_HEADER = "As you answer the user's questions, you can use the following context:";

const CONTEXT_RELEVANCE =
  "      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.";

/** 排序权重：system 先于 meta_user，stable 先于 dynamic；同档保持收集顺序（sort 稳定）。 */
const TARGET_ORDER: Record<ContextSection["injectionTarget"], string> = {
  system: "0",
  meta_user: "1",
};

const CACHE_ORDER: Record<ContextSection["cacheHint"], string> = { stable: "0", dynamic: "1" };

const sectionRank = (section: ContextSection): string =>
  TARGET_ORDER[section.injectionTarget] + CACHE_ORDER[section.cacheHint];

const isSystemSection = (section: ContextSection): boolean => section.injectionTarget === "system";

const isMetaUserSection = (section: ContextSection): boolean =>
  section.injectionTarget === "meta_user";

export function orderSections(sections: readonly ContextSection[]): ContextSection[] {
  return [...sections].sort((left, right) => sectionRank(left).localeCompare(sectionRank(right)));
}

/** 自定义 system prompt 段：整段替换 identity，正文前补一个换行。 */
function customSystemPromptSection(content: string): ContextSection {
  return {
    name: "Custom System Prompt",
    source: "custom_system_prompt",
    injectionTarget: "system",
    cacheHint: "stable",
    content,
    chars: content.length,
    tokens: estimateTokens(content),
    preview: content.slice(0, 100),
  };
}

/** 头部：CLI prefix（工作流子代理不带）与身份段三选一。 */
function headSections(
  config: ContextBuilderConfig,
  customSystemPrompt: string | undefined,
  activeOutputStyle: ContextBuilderConfig["outputStyle"],
): ContextSection[] {
  const sections: ContextSection[] = [];
  const isWorkflowActor = config.workflowActor !== undefined;
  if (!isWorkflowActor) {
    sections.push(buildCliPrefixSection());
  }
  if (customSystemPrompt !== undefined) {
    sections.push(customSystemPromptSection(`\n${customSystemPrompt}`));
  } else if (config.workflowActor) {
    sections.push(buildWorkflowActorIdentitySection(config.workflowActor));
  } else {
    sections.push(buildIdentitySection(activeOutputStyle));
  }
  return sections;
}

/** 交互式路径的基座段：桌面协议、动态行为、会话指导、memory、环境、输出风格、上下文管理、git。 */
function baselineSections(
  config: ContextBuilderConfig,
  activeOutputStyle: ContextBuilderConfig["outputStyle"],
): ContextSection[] {
  const sections: ContextSection[] = [];
  if (config.presentationSurface === "knorvia_desktop") {
    sections.push(buildDesktopContextSection());
  }
  sections.push(buildDynamicBehaviorSection());
  const sessionGuidance = buildSessionGuidanceSection(
    config.guidanceToolNames ?? [],
    (config.skills?.skills.length ?? 0) > 0,
  );
  if (sessionGuidance) sections.push(sessionGuidance);
  if (config.memoryRoot) {
    const memory = buildMemorySection(config.memoryRoot);
    if (memory) sections.push(memory);
  }
  sections.push(buildEnvInfoSection(config.envInfo, config.model));
  const outputStyle = buildOutputStyleSection(activeOutputStyle);
  if (outputStyle) sections.push(outputStyle);
  sections.push(buildContextManagementSection());
  const gitContext = buildGitSystemContextSection(config.envInfo);
  if (gitContext) sections.push(gitContext);
  return sections;
}

/** skills 段只在「没有 guidanceToolNames」或其中含 Skill 时产出。 */
function skillsSections(config: ContextBuilderConfig): ContextSection[] {
  if (!config.skills) return [];
  const toolNames = config.guidanceToolNames;
  if (toolNames !== undefined && !toolNames.includes("Skill")) return [];
  const skills = buildSkillsSection({
    outcome: config.skills,
    metadataBudget: config.skillMetadataBudget,
  });
  return skills ? [skills] : [];
}

/** 尾部：request-level 用户上下文与当前日期。 */
function tailSections(config: ContextBuilderConfig): ContextSection[] {
  const sections: ContextSection[] = [];
  const userContext = buildRequestUserContextSection({
    userInstructions: config.userInstructions,
    memoryIndexContent: config.memoryIndexContent,
    memoryRoot: config.memoryRoot,
  });
  if (userContext) sections.push(userContext);
  const currentDate = buildCurrentDateSection(config.currentDate);
  if (currentDate) sections.push(currentDate);
  return sections;
}

/**
 * 收集全部 section：头部（CLI prefix + 身份）→ 基座段 → skills → 尾部 → 自定义段。
 * 自定义 system prompt 在场时只留「头部 + skills + 尾部」，与基座段互斥。
 */
export function collectSections(
  config: ContextBuilderConfig,
  customSections: readonly ContextSection[],
): ContextSection[] {
  const customSystemPrompt = config.customSystemPrompt?.trim();
  const hasCustomSystemPrompt = Boolean(customSystemPrompt);
  const isWorkflowActor = config.workflowActor !== undefined;
  if (isWorkflowActor && hasCustomSystemPrompt) {
    throw new Error("ContextBuilder: workflowActor and customSystemPrompt are mutually exclusive");
  }
  const activeOutputStyle = config.outputStyle?.prompt.trim() ? config.outputStyle : undefined;
  const sections = headSections(config, customSystemPrompt, activeOutputStyle);
  if (!hasCustomSystemPrompt && !isWorkflowActor) {
    sections.push(...baselineSections(config, activeOutputStyle));
  }
  sections.push(...skillsSections(config));
  sections.push(...tailSections(config));
  sections.push(...customSections);
  return sections;
}

/** system messages：prefix、stable（不含 prefix）、dynamic 三段，各自用空行拼接。 */
export function assembleSystemMessages(
  sections: readonly ContextSection[],
): ContextBuildResult["systemMessages"] {
  const grouped = new Map<string, string[]>();
  for (const section of sections) {
    if (!isSystemSection(section)) continue;
    const bucket = section.source === "cli_prefix" ? "prefix" : section.cacheHint;
    const list = grouped.get(bucket) ?? [];
    list.push(section.content);
    grouped.set(bucket, list);
  }
  const messages: ContextBuildResult["systemMessages"] = [];
  const prefix = grouped.get("prefix")?.join("\n\n");
  if (prefix) {
    messages.push({ role: "system", content: prefix, cacheControl: CACHE_CONTROL });
  }
  const stable = grouped.get("stable")?.join("\n\n");
  if (stable) {
    messages.push({ role: "system", content: stable, cacheControl: CACHE_CONTROL });
  }
  const dynamic = grouped.get("dynamic")?.join("\n\n");
  if (dynamic) {
    messages.push({ role: "system", content: `\n\n${dynamic}`, cacheControl: CACHE_CONTROL });
  }
  return messages;
}

export function contextMetaUserBody(sections: readonly ContextSection[]): string | null {
  if (sections.length === 0) return null;
  const content = sections.map((section) => section.content).join("\n\n");
  return `${CONTEXT_HEADER}\n${content}\n\n${CONTEXT_RELEVANCE}`;
}

export function skillsMetaUserBody(sections: readonly ContextSection[]): string | null {
  const content = sections.map((section) => section.content).join("\n\n");
  return content || null;
}

/** meta user 附件：skills 单独一条，其余 context 合成一条。 */
export function assembleMetaUserAttachments(
  sections: readonly ContextSection[],
): ContextBuildResult["metaUserAttachments"] {
  const attachments: ContextBuildResult["metaUserAttachments"] = [];
  const metaUser = sections.filter(isMetaUserSection);
  const skills = skillsMetaUserBody(metaUser.filter((section) => section.source === "skills"));
  if (skills) attachments.push({ source: "skills_listing", content: skills });
  const context = contextMetaUserBody(metaUser.filter((section) => section.source !== "skills"));
  if (context) attachments.push({ source: "context_prefix", content: context });
  return attachments;
}
