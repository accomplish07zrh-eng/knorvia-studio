// SPDX-License-Identifier: Apache-2.0
// Workspace hook 的配置与工具调用元数据类型（纯声明）。
import type { SettingsDirectoryLocation } from "./settings-source.js";
import type { WorkspaceHookReviewTrustState } from "./protocol-v4/workspace-hook-review.js";

const HOOK_EVENT_TABLE = {
  sessionStart: "SessionStart",
  userPromptSubmit: "UserPromptSubmit",
  preToolUse: "PreToolUse",
  permissionRequest: "PermissionRequest",
  postToolUse: "PostToolUse",
  postToolUseFailure: "PostToolUseFailure",
  stop: "Stop",
} as const;
export type HookEvent = (typeof HOOK_EVENT_TABLE)[keyof typeof HOOK_EVENT_TABLE];

const HOOK_TYPE_TABLE = { command: "command", process: "process" } as const;
export type HookType = (typeof HOOK_TYPE_TABLE)[keyof typeof HOOK_TYPE_TABLE];

export type HookConfiguredState = {
  sourceRootEnabled: /* 来源根是否启用 */ boolean;
  declarationEnabled: /* 声明处是否启用 */ boolean;
  runtimeHooksEnabled: /* 运行时 hooks 总开关 */ boolean;
  configuredEnabled: /* 合成后的启用态 */ boolean;
  sourcePath: /* 声明文件路径 */ string;
};

export type WorkspaceHookDiscoveryState = HookConfiguredState & {
  reviewItemId: /* 审核项 ID */ string;
  workspaceIdentity: /* 身份 key */ string;
  bundleDigest: /* bundle 摘要 */ string;
  hookDeclarationDigest: /* hook 声明摘要 */ string;
  sourceFileIndex: /* 来源文件序号 */ number;
  // 只读 Settings 评估结果；live Runtime 审核投影会覆盖该值。
  trustState?: WorkspaceHookReviewTrustState;
};

export type Hook = {
  id: /* hook 标识 */ string;
  event: /* 触发事件 */ HookEvent;
  matcher?: /* 工具名匹配串 */ string;
  type: /* 实现形态 */ HookType;
  command: /* 命令 */ string;
  args?: /* 参数列表 */ string[];
  async?: /* 是否异步执行 */ boolean;
  shell?: /* shell 形态开关或解释器 */ true | string;
  statusMessage?: /* 状态展示文案 */ string;
  timeout?: /* 超时毫秒 */ number;
  enabled: /* 是否启用 */ boolean;
  editable?: /* 是否可编辑 */ boolean;
  configuredState?: /* 配置合成态 */ HookConfiguredState;
  workspaceHook?: /* workspace 发现态 */ WorkspaceHookDiscoveryState;
  custom?: /* 自定义扩展字段 */ Record<string, unknown>;
  location?: /* 所在设置目录位置 */ SettingsDirectoryLocation;
};

export type HookConfig = {
  event: /* 触发事件 */ HookEvent;
  matcher?: /* 工具名匹配串 */ string;
  type: /* 实现形态 */ HookType;
  command: /* 命令 */ string;
  args?: /* 参数列表 */ string[];
  async?: /* 是否异步执行 */ boolean;
  shell?: /* shell 形态开关或解释器 */ true | string;
  statusMessage?: /* 状态展示文案 */ string;
  timeout?: /* 超时毫秒 */ number;
  enabled?: /* 是否启用 */ boolean;
  custom?: /* 自定义扩展字段 */ Record<string, unknown>;
  storageLevel?: /* 保存层级 */ "user" | "project";
};

/**
 * hook 在工具调用里的标识元数据。
 * chat-panel.types.ts 与 conversationStore.ts 共用。
 */
export type ToolCallHookMeta = {
  isHook?: /* 是否 hook 调用 */ boolean;
  hookEvent?: /* 触发事件名 */ string;
  hookCommand?: /* 命令 */ string;
  hookMatcher?: /* 匹配串 */ string;
  hookToolName?: /* 承载工具名 */ string;
  hookExitCode?: /* 退出码 */ number | null;
  hookError?: /* 错误文本 */ string;
  hookStdout?: /* 标准输出 */ string;
  hookName?: /* hook 名称 */ string;
  hookFeedback?: /* 反馈文本 */ string;
  hookStderr?: /* 标准错误 */ string;
  /** Skill 相关元数据。 */
  "knorvia/isSkill"?: boolean;
  "knorvia/skillName"?: string;
  [key: string]: unknown;
};
