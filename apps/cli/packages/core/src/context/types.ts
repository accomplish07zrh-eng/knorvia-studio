// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// context 区的类型面：来源标识、section 形状、构建结果与 builder 配置。
import type * as contracts from "@knorvia/contracts";
import type { AutoCompactPolicyConfig } from "../compact/index.js";
import type { AgentProfile } from "../subagent/profile.js";

export type {
  EnvInfo,
  PackageManager,
  ProjectContext,
  ProjectType,
  ResolvedUserInstructionSource,
  ResolvedUserInstructions,
  UserInstructionsOptions,
} from "@knorvia/contracts";

// 来源标识：每个 section 自己的 source 取值。
export type ContextSource =
  | "cli_prefix" // CLI / 产品身份前缀
  | "identity" // Agent 基础描述
  | "env_info" // 环境信息 (cwd, platform, git repo boolean)
  | "system_context" // git snapshot context
  | "skills" // 可用 skills
  | "tools" // 工具定义
  | "request_user_context" // request-level user context provider-visible 组合块
  | "memory" // 长期 memory read path
  | "current_date" // 当前日期
  | "custom_system_prompt" // 自定义 stable system body
  | "workflow_actor_identity" // 动态工作流子代理身份：契约 + persona 叠加
  | "subagent_agent_prompt" // 子 agent 专属身份/任务 prompt
  | "subagent_notes" // 子 agent 通用操作提醒
  | "subagent_environment" // 子 agent 环境和模型上下文
  | "dynamic_behavior" // 动态行为边界
  | "session_guidance" // 当前可用内置能力指导
  | "output_style" // 输出风格
  | "context_management" // 长上下文管理提示
  | "desktop_context"; // Knorvia Studio Desktop 渲染与交互协议

export type ContextInjectionTarget = "system" | "meta_user";

export type ContextCacheHint = "stable" | "dynamic";

// 2026-10-23 移出：`PresentationSurface` 已提到 `@knorvia/shared-types`。
// 它是纯字面量联合类型，而 core / cli / bootstrap 三方都要引用；
// core 会随 kernel-switch 删除，所以提到纯类型包让两侧稳定依赖。
// 这里既转发（保持 `@knorvia/core` 导出面不变），也 import 供本文件下文使用。
export type { PresentationSurface } from "@knorvia/shared-types";
import type { PresentationSurface } from "@knorvia/shared-types";

// section 形状：名称、来源、注入位置、缓存提示与三份正文度量。
export interface ContextSection {
  name: string; // 人类可读的 section 名称
  source: ContextSource; // 来源标识
  injectionTarget: ContextInjectionTarget; // 注入位置
  cacheHint: ContextCacheHint; // 缓存稳定性提示
  chars: number; // 字符数
  tokens: number; // 估算 token 数
  content: string; // 完整内容
  preview: string; // 前 100 字符预览
}

export type ContextMetaUserAttachmentSource = "skills_listing" | "context_prefix";

export interface ContextMetaUserAttachment {
  source: ContextMetaUserAttachmentSource;
  content: string;
}

// 构建结果：section 明细 + 两条合计 + 组装好的消息与 meta user 附件。
export interface ContextBuildResult {
  sections: ContextSection[];
  totalChars: number;
  totalTokens: number;
  systemMessages: contracts.ModelInputMessage[]; // ContextBuilder 只组装 system messages
  metaUserAttachments: ContextMetaUserAttachment[]; // 未包裹 <system-reminder> 的 meta user body
}

export interface OutputStylePromptConfig {
  name: string;
  prompt: string;
  keepCodingInstructions?: boolean;
}

// builder 配置：一次构建需要的全部输入。
export interface ContextBuilderConfig {
  workingDirectory: string;
  envInfo: contracts.EnvInfo;
  /** 当前步骤的执行对象，不进入 Context Source 或持久化环境快照。 */
  model?: contracts.Model;
  presentationSurface?: PresentationSurface;
  currentDate?: string;
  userInstructions?: contracts.ResolvedUserInstructions;
  projectContext?: contracts.ProjectContext;
  memoryRoot?: string;
  memoryIndexContent?: string;
  skills?: contracts.SkillLoadOutcome;
  agentProfiles?: readonly AgentProfile[];
  embeddedSearchEnabled?: boolean;
  skillMetadataBudget?: number;
  customSystemPrompt?: string;
  /**
   * 动态工作流子代理（workflow child）的身份输入。在场即走 builder 的第三条路径：
   * 基座段（CLI prefix、安全行、Harness、memory）+ 工作流子代理契约 + persona 叠加，
   * 而不是像 `customSystemPrompt` 那样整段替换。与 `customSystemPrompt` 互斥。
   */
  workflowActor?: WorkflowActorContext;
  language?: string;
  outputStyle?: OutputStylePromptConfig;
  compact?: AutoCompactPolicyConfig;
  guidanceToolNames?: readonly string[];
}

// 工作流子代理的身份输入：有效名（匿名缺席）与作者写的 persona（可缺席）。
// 没有工具档位：每个子代理都有完整工作工具集，契约只有一份文本。
export interface WorkflowActorContext {
  name?: string;
  persona?: string;
}

export type ContextUserInstructionsRequest = contracts.UserInstructionsOptions;
