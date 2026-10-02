import type {
  ContextSection,
  ContextBuildResult,
  ContextBuilderConfig,
  EnvInfo,
} from "./types.js";
import type { ToolRegistry } from "../tool/registry.js";
import { estimateTokens } from "./utils.js";
import { buildCliPrefixSection } from "./sections/cli-prefix.js";
import { buildIdentitySection } from "./sections/identity.js";
import { buildWorkflowActorIdentitySection } from "./sections/workflow-actor.js";
import {
  buildEnvInfoSection,
  buildGitSystemContextSection,
} from "./sections/env-info.js";
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

const CACHE_CONTROL: { type: "ephemeral" } = { type: "ephemeral" };
const CONTEXT_HEADER =
  "As you answer the user's questions, you can use the following context:";
const CONTEXT_RELEVANCE =
  "      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.";

export class ContextBuilder {
  private config: ContextBuilderConfig;
  private customSections: ContextSection[] = [];

  constructor(config: ContextBuilderConfig) {
    this.config = config;
  }

  setToolRegistry(_registry: ToolRegistry): this {
    return this;
  }

  setEnvInfo(envInfo: EnvInfo): this {
    this.config = { ...this.config, envInfo };
    return this;
  }

  addSection(
    section: Omit<
      ContextSection,
      "chars" | "tokens" | "injectionTarget" | "cacheHint"
    > & Partial<Pick<ContextSection, "injectionTarget" | "cacheHint">>,
  ): this {
    this.customSections.push({
      ...section,
      injectionTarget: section.injectionTarget ?? "system",
      cacheHint: section.cacheHint ?? "dynamic",
      chars: section.content.length,
      tokens: estimateTokens(section.content),
    });
    return this;
  }

  build(): ContextBuildResult {
    const activeOutputStyle = this.config.outputStyle?.prompt.trim()
      ? this.config.outputStyle
      : undefined;
    const customSystemPrompt = this.config.customSystemPrompt?.trim();
    const hasCustomSystemPrompt = Boolean(customSystemPrompt);
    const workflowActor = this.config.workflowActor;
    const isWorkflowActor = workflowActor !== undefined;

    if (isWorkflowActor && hasCustomSystemPrompt) {
      throw new Error(
        "ContextBuilder: workflowActor and customSystemPrompt are mutually exclusive",
      );
    }

    const sections: ContextSection[] = [];
    if (!isWorkflowActor) {
      sections.push(buildCliPrefixSection());
    }

    if (hasCustomSystemPrompt) {
      const content = `\n${customSystemPrompt}`;
      sections.push({
        name: "Custom System Prompt",
        source: "custom_system_prompt",
        injectionTarget: "system",
        cacheHint: "stable",
        content,
        chars: content.length,
        tokens: estimateTokens(content),
        preview: content.slice(0, 100),
      });
    } else if (isWorkflowActor) {
      sections.push(buildWorkflowActorIdentitySection(workflowActor));
    } else {
      sections.push(buildIdentitySection(activeOutputStyle));
    }

    if (!hasCustomSystemPrompt) {
      if (
        !isWorkflowActor &&
        this.config.presentationSurface === "knorvia_desktop"
      ) {
        sections.push(buildDesktopContextSection());
      }
      if (!isWorkflowActor) {
        sections.push(buildDynamicBehaviorSection());
        const sessionGuidance = buildSessionGuidanceSection(
          this.config.guidanceToolNames ?? [],
          Boolean((this.config.skills?.skills.length ?? 0) > 0),
        );
        if (sessionGuidance) sections.push(sessionGuidance);
      }
      if (this.config.memoryRoot) {
        const memory = buildMemorySection(this.config.memoryRoot);
        if (memory) sections.push(memory);
      }
      sections.push(buildEnvInfoSection(this.config.envInfo, this.config.model));
      const outputStyle = buildOutputStyleSection(activeOutputStyle);
      if (outputStyle) sections.push(outputStyle);
      sections.push(buildContextManagementSection());
      const gitContext = buildGitSystemContextSection(this.config.envInfo);
      if (gitContext) sections.push(gitContext);
    }

    if (this.config.skills) {
      const toolNames = this.config.guidanceToolNames;
      if (toolNames === undefined || toolNames.includes("Skill")) {
        const skills = buildSkillsSection({
          outcome: this.config.skills,
          metadataBudget: this.config.skillMetadataBudget,
        });
        if (skills) sections.push(skills);
      }
    }

    const userContext = buildRequestUserContextSection({
      userInstructions: this.config.userInstructions,
      memoryIndexContent: this.config.memoryIndexContent,
      memoryRoot: this.config.memoryRoot,
    });
    if (userContext) sections.push(userContext);
    const currentDate = buildCurrentDateSection(this.config.currentDate);
    if (currentDate) sections.push(currentDate);
    sections.push(...this.customSections);

    const orderedSections = [
      ...sections.filter(
        (section) =>
          section.injectionTarget === "system" && section.cacheHint === "stable",
      ),
      ...sections.filter(
        (section) =>
          section.injectionTarget === "system" && section.cacheHint === "dynamic",
      ),
      ...sections.filter(
        (section) =>
          section.injectionTarget === "meta_user" &&
          section.cacheHint === "stable",
      ),
      ...sections.filter(
        (section) =>
          section.injectionTarget === "meta_user" &&
          section.cacheHint === "dynamic",
      ),
    ];
    const totalChars = orderedSections.reduce(
      (total, section) => total + section.chars,
      0,
    );
    const totalTokens = orderedSections.reduce(
      (total, section) => total + section.tokens,
      0,
    );
    const systemMessages = buildSystemMessages(orderedSections);
    const metaUserAttachments = buildMetaUserAttachments(orderedSections);
    return {
      sections: orderedSections,
      totalChars,
      totalTokens,
      systemMessages,
      metaUserAttachments,
    };
  }
}

function buildSystemMessages(
  sections: ContextSection[],
): ContextBuildResult["systemMessages"] {
  const messages: ContextBuildResult["systemMessages"] = [];
  const cliPrefix = sections
    .filter(
      (section) =>
        section.injectionTarget === "system" && section.source === "cli_prefix",
    )
    .map((section) => section.content)
    .join("\n\n");
  if (cliPrefix) {
    messages.push({ role: "system", content: cliPrefix, cacheControl: CACHE_CONTROL });
  }
  const stable = sections
    .filter(
      (section) =>
        section.injectionTarget === "system" &&
        section.cacheHint === "stable" &&
        section.source !== "cli_prefix",
    )
    .map((section) => section.content)
    .join("\n\n");
  if (stable) {
    messages.push({ role: "system", content: stable, cacheControl: CACHE_CONTROL });
  }
  const dynamic = sections
    .filter(
      (section) =>
        section.injectionTarget === "system" && section.cacheHint === "dynamic",
    )
    .map((section) => section.content)
    .join("\n\n");
  if (dynamic) {
    messages.push({
      role: "system",
      content: `\n\n${dynamic}`,
      cacheControl: CACHE_CONTROL,
    });
  }
  return messages;
}

function buildMetaUserAttachments(
  sections: ContextSection[],
): ContextBuildResult["metaUserAttachments"] {
  const attachments: ContextBuildResult["metaUserAttachments"] = [];
  const skills = buildSkillsMetaUserBody(
    sections.filter(
      (section) =>
        section.injectionTarget === "meta_user" && section.source === "skills",
    ),
  );
  if (skills) attachments.push({ source: "skills_listing", content: skills });
  const context = buildContextMetaUserBody(
    sections.filter(
      (section) =>
        section.injectionTarget === "meta_user" && section.source !== "skills",
    ),
  );
  if (context) attachments.push({ source: "context_prefix", content: context });
  return attachments;
}

export function buildContextMetaUserBody(
  sections: ContextSection[],
): string | null {
  if (sections.length === 0) return null;
  const content = sections.map((section) => section.content).join("\n\n");
  return `${CONTEXT_HEADER}\n${content}\n\n${CONTEXT_RELEVANCE}`;
}

export function buildSkillsMetaUserBody(
  sections: ContextSection[],
): string | null {
  const content = sections.map((section) => section.content).join("\n\n");
  return content || null;
}

export function createContextBuilder(
  config: ContextBuilderConfig,
): ContextBuilder {
  return new ContextBuilder(config);
}
