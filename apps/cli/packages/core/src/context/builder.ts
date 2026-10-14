// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// ContextBuilder 公开类：只做门面（持有配置与自定义段、转发装配管线）与互斥校验，
// section 收集、排序与消息组装都在 ./builder-pipeline.js。
import type { ContextSection, ContextBuildResult, ContextBuilderConfig, EnvInfo } from "./types.js";
import type { ToolRegistry } from "../tool/registry.js";
import { estimateTokens } from "./utils.js";
import {
  assembleMetaUserAttachments,
  assembleSystemMessages,
  collectSections,
  contextMetaUserBody,
  orderSections,
  skillsMetaUserBody,
} from "./builder-pipeline.js";

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
    section: Omit<ContextSection, "chars" | "tokens" | "injectionTarget" | "cacheHint"> &
      Partial<Pick<ContextSection, "injectionTarget" | "cacheHint">>,
  ): this {
    const injectionTarget = section.injectionTarget ?? "system";
    const cacheHint = section.cacheHint ?? "dynamic";
    this.customSections.push({
      ...section,
      injectionTarget,
      cacheHint,
      chars: section.content.length,
      tokens: estimateTokens(section.content),
    });
    return this;
  }

  build(): ContextBuildResult {
    const orderedSections = orderSections(collectSections(this.config, this.customSections));
    const totalChars = orderedSections.reduce((total, section) => total + section.chars, 0);
    const totalTokens = orderedSections.reduce((total, section) => total + section.tokens, 0);
    return {
      sections: orderedSections,
      totalChars,
      totalTokens,
      systemMessages: assembleSystemMessages(orderedSections),
      metaUserAttachments: assembleMetaUserAttachments(orderedSections),
    };
  }
}

export const buildContextMetaUserBody = (sections: ContextSection[]): string | null =>
  contextMetaUserBody(sections);

export const buildSkillsMetaUserBody = (sections: ContextSection[]): string | null =>
  skillsMetaUserBody(sections);

export const createContextBuilder = (config: ContextBuilderConfig): ContextBuilder =>
  new ContextBuilder(config);
