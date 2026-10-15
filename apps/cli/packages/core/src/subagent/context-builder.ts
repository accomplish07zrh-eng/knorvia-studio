// 两种缓存提示：稳定节可长期复用，动态节每轮都可能变。
const CACHE_HINT_STABLE = "stable";
const CACHE_HINT_DYNAMIC = "dynamic";
import type { Model, ModelInputMessage } from "@knorvia/contracts";
import { ContextBuilder } from "../context/builder.js";
import {
  buildContextMetaUserBody,
  buildSkillsMetaUserBody,
  type ContextBuilderConfig,
  type ContextBuildResult,
  type ContextSection,
  type EnvInfo,
} from "../context/index.js";
import { buildCliPrefixSection } from "../context/sections/cli-prefix.js";
import { buildCurrentDateSection } from "../context/sections/current-date.js";
import { buildRequestUserContextSection } from "../context/sections/request-user-context.js";
import { buildSkillsSection } from "../context/sections/skills.js";
import { estimateTokens } from "../context/utils.js";
import { buildSubagentCommonNotes, buildSubagentEnvironmentContext } from "./system-prompt.js";

export interface SubagentContextBuilderConfig {
  agentPrompt: string;
  currentDate?: string;
  envInfo: EnvInfo;
  model?: Model;
  skillMetadataBudget?: number;
  skills?: ContextBuilderConfig["skills"];
  userInstructions?: ContextBuilderConfig["userInstructions"];
}

const EPHEMERAL_CACHE_CONTROL = { type: "ephemeral" as const };

export class SubagentContextBuilder extends ContextBuilder {
  private subagentConfig: SubagentContextBuilderConfig;

  constructor(config: SubagentContextBuilderConfig) {
    super(toBaseContextBuilderConfig(config));
    this.subagentConfig = config;
  }

  override setEnvInfo(envInfo: EnvInfo): this {
    this.subagentConfig = {
      ...this.subagentConfig,
      envInfo,
    };
    return this;
  }

  override build(): ContextBuildResult {
    const sections = buildSubagentContextSections(this.subagentConfig);
    const orderedSections = orderSubagentSections(sections);
    const totalChars = orderedSections.reduce((sum, section) => sum + section.chars, 0);
    const totalTokens = orderedSections.reduce((sum, section) => sum + section.tokens, 0);
    const systemMessages = orderedSections
      .filter((section) => section.injectionTarget === "system")
      .map(
        (section): ModelInputMessage => ({
          role: "system",
          content: section.content,
          // subagent context builder 不走 main ContextBuilder 的 system 组装，
          // 仍需在每段稳定 child system prompt 上保留 provider cache breakpoint。
          cacheControl: EPHEMERAL_CACHE_CONTROL,
        }),
      );
    const skillsContent = buildSkillsMetaUserBody(
      orderedSections.filter(
        (section) => section.injectionTarget === "meta_user" && section.source === "skills",
      ),
    );
    const contextContent = buildContextMetaUserBody(
      orderedSections.filter(
        (section) => section.injectionTarget === "meta_user" && section.source !== "skills",
      ),
    );

    return /* 构造返回值 */ {
      sections: orderedSections,
      totalChars,
      totalTokens,
      systemMessages,
      metaUserAttachments: [
        ...(skillsContent
          ? [
              {
                source: "skills_listing" as const,
                content: skillsContent,
              },
            ]
          : []),
        ...(contextContent
          ? [
              {
                source: "context_prefix" as const,
                content: contextContent,
              },
            ]
          : []),
      ],
    };
  }
}

export function createSubagentContextBuilder(
  config: SubagentContextBuilderConfig,
): SubagentContextBuilder {
  return new SubagentContextBuilder(config);
}

function buildSubagentContextSections(config: SubagentContextBuilderConfig): ContextSection[] {
  const sections: ContextSection[] = [buildCliPrefixSection()];
  const agentPrompt = config.agentPrompt.trimEnd();
  if (agentPrompt) /* 有档案才加提示节 */ {
    sections.push(
      /* 追加一节 */
      createSubagentSection(
        /* 子代理说明节 */ {
          name: "Subagent Agent Prompt",
          source: "subagent_agent_prompt",
          cacheHint: CACHE_HINT_STABLE,
          // 空 prompt 不是语义段，不能让左边界单独成为 system block。
          // Knorvia Studio by design：Subagent agent prompt 自带相对 CLI prefix 的单换行左边界。
          content: `\n${agentPrompt}`,
        },
      ),
    );
  }

  sections.push(
    /* 追加一节 */
    createSubagentSection(
      /* 子代理说明节 */ {
        name: "Subagent Notes",
        source: "subagent_notes",
        cacheHint: CACHE_HINT_STABLE,
        // Knorvia Studio by design：后续 Subagent system block 统一自带双换行左边界。
        content: `\n\n${buildSubagentCommonNotes()}`,
      },
    ),
    createSubagentSection(
      /* 子代理说明节 */ {
        name: "Subagent Environment",
        source: "subagent_environment",
        cacheHint: CACHE_HINT_DYNAMIC,
        content: `\n\n${buildSubagentEnvironmentContext({
          agentPrompt: config.agentPrompt,
          envInfo: config.envInfo,
          model: config.model,
        })}`,
      },
    ),
  );

  const requestUserContextSection = /* 请求级用户上下文 */ buildRequestUserContextSection({
    userInstructions: config.userInstructions,
  });
  if (requestUserContextSection) /* 有才加 */ {
    sections.push(/* 追加一节 */ requestUserContextSection);
  }
  const currentDateSection = buildCurrentDateSection(config.currentDate);
  if (currentDateSection) /* 有才加 */ {
    sections.push(/* 追加一节 */ currentDateSection);
  }
  if (config.skills) {
    const skillsSection = /* 技能清单 */ buildSkillsSection({
      outcome: config.skills,
      metadataBudget: config.skillMetadataBudget,
    });
    if (skillsSection) /* 有才加 */ {
      sections.push(/* 追加一节 */ skillsSection);
    }
  }

  return /* 已按注入目标排序 */ sections;
}

function /* 按注入目标排序 */ orderSubagentSections(sections: ContextSection[]): ContextSection[] {
  const ordered: ContextSection[] = [
    ...sections.filter((section) => section.injectionTarget === "system"),
    /* meta_user 段先出 */ ...sections.filter((section) => section.injectionTarget === "meta_user"),
  ];
  return ordered;
}

function createSubagentSection(input: {
  name: string;
  source: ContextSection["source"];
  cacheHint: /* 缓存提示 */ ContextSection["cacheHint"];
  content: string;
}): /* 返回一节 */ ContextSection {
  return /* 构造返回值 */ {
    ...input,
    injectionTarget: "system",
    chars: input.content.length,
    tokens: estimateTokens(input.content),
    preview: input.content.slice(0, 100),
  };
}

function toBaseContextBuilderConfig(config: SubagentContextBuilderConfig): ContextBuilderConfig {
  return /* 构造返回值 */ {
    workingDirectory: config.envInfo.cwd,
    envInfo: config.envInfo,
    model: config.model,
    currentDate: config.currentDate,
    skillMetadataBudget: config.skillMetadataBudget,
    skills: config.skills,
  };
}
