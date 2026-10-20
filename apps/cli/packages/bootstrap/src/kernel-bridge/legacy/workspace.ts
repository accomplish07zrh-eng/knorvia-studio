// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：workspace 级只读方法与策略偏好。
//
// 状态所有者：workspace 偏好由本文件的 `WorkspacePreferences` 持有（CLI 进程按 workspace 隔离，
// 缓存一份即可——与默认引擎的 `appRuntimePreferences` 同语义）。目录类事实（斜杠命令、
// MCP、插件、工作流）由各自域引擎提供，本文件只做协议投影。

import {
  APP_PROTOCOL_APP_ONLY_BUILTIN_SLASH_COMMANDS,
  APP_PROTOCOL_VISIBLE_BUILTIN_SLASH_COMMAND_NAMES,
} from "../../slash-command-surface.js";

/** 内置斜杠命令目录（`workspace/readPresentation` 的形状）。 */
export interface SlackCommandView {
  readonly name: string;
  readonly description: string;
  readonly inputHint?: string;
  readonly source?: "builtin" | "custom";
}

/**
 * workspace 级内存偏好。与默认引擎相同的三项，都是「host 判定、CLI 缓存」的灰度门：
 * off-peak 工具面、动态工作流、交互偏好。
 */
export class WorkspacePreferences {
  private askUserQuestionAutoResolutionEnabled = true;
  private modelIoFullRetentionEnabled = false;
  private offPeakToolEnabled = false;
  private dynamicWorkflowEnabled = false;

  get interactionAutoResolutionEnabled(): boolean {
    return this.askUserQuestionAutoResolutionEnabled;
  }

  get fullRetentionEnabled(): boolean {
    return this.modelIoFullRetentionEnabled;
  }

  get isOffPeakToolEnabled(): boolean {
    return this.offPeakToolEnabled;
  }

  get isDynamicWorkflowEnabled(): boolean {
    return this.dynamicWorkflowEnabled;
  }

  setInteractionAutoResolution(enabled: boolean): void {
    this.askUserQuestionAutoResolutionEnabled = enabled;
  }

  setModelIoFullRetention(enabled: boolean): void {
    this.modelIoFullRetentionEnabled = enabled;
  }

  setOffPeakToolEnabled(enabled: boolean): void {
    this.offPeakToolEnabled = enabled;
  }

  setDynamicWorkflowEnabled(enabled: boolean): void {
    this.dynamicWorkflowEnabled = enabled;
  }
}

/**
 * 斜杠命令目录。
 *
 * 内置命令的 name/summary/usage 来自 `@knorvia/shared` 的 `BUILTIN_KNORVIA_SLASH_COMMAND_HELP_ENTRIES`
 * （`slash-command-surface.ts` 只提供「哪些内置命令对 App 可见」的名表）；自定义命令
 * 的发现依赖插件目录，本包不承担（见 acceptance「未覆盖」：自定义命令归 kernel-plugin-*）。
 * 因此这里只投影内置部分，顺序与默认引擎一致（goal / compact / init，再补 plan）。
 */
export function listBuiltinSlashCommands(
  helpEntries: readonly {
    readonly name: string;
    readonly summary: string;
    readonly usage: string;
  }[],
): SlackCommandView[] {
  const builtins = APP_PROTOCOL_VISIBLE_BUILTIN_SLASH_COMMAND_NAMES.flatMap((name) => {
    const entry = helpEntries.find((candidate) => candidate.name === name);
    if (entry === undefined) return [];
    return [
      {
        description: entry.summary,
        inputHint: entry.usage,
        name: entry.name,
        source: "builtin" as const,
      },
    ];
  });
  return [
    ...builtins,
    ...APP_PROTOCOL_APP_ONLY_BUILTIN_SLASH_COMMANDS.map((entry) => ({ ...entry })),
  ];
}
