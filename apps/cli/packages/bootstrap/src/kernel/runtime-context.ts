// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 运行环境上下文：让模型知道自己在哪个目录、什么平台、什么 shell、今天几号。
// 旧内核把这些信息放在 system prompt 的 Environment 段与 currentDate 段；
// DSH 的 includeRuntimeContext 关闭时模型什么都看不到，打开后又需要有人提供这些字段。
// 本模块就是一个 DSH 插件行：用公开的 ctx.systemPrompt.context() 注册动态上下文，
// 每次装配求值，不做启动期常量。
//
// 契约见 specs/contracts/kernel-dsh-builtins/interface.md §四（B14-B16）。

import { release } from "node:os";
import type { Context } from "@deepseek-ai/cordis";
// 只为拿到 systemPrompt 的 Context 类型增强（该包用 declare module 扩充 Context）。
import type {} from "@deepseek-ai/dsh-system-prompt";

/** 贡献名；不得与 DSH 内建贡献重名（内建的是 `sandbox:policy` 一类带冒号的域内名字）。 */
export const RUNTIME_CONTEXT_NAME = "knorvia:runtime-context";

/** 旧内核 Environment 段的标题与前缀句（`core/src/context/sections/env-info.ts`）。 */
const ENVIRONMENT_TITLE = "# Environment";
const ENVIRONMENT_INTRO = "You have been invoked in the following environment:";

/** 当前日期段的标题与原句（`core/src/context/sections/current-date.ts`）。 */
const CURRENT_DATE_PREFIX = "Today's date is";

/** 平台对应的 shell 名；与组合里启用的执行器支保持一致。 */
function shellNameForPlatform(platform: string): string {
  return platform === "win32" ? "pwsh" : "bash";
}

/** 本地日期，形如 `2026-10-20`；按宿主时区取，不用 UTC 以免跨日错位。 */
function localDateOf(now: Date): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 宿主时区；解析不出时回落到 UTC 标签，保证字段非空（B14）。 */
function timeZoneName(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return resolved && resolved.trim().length > 0 ? resolved : "UTC";
}

/** 一次装配可注入的时点与目录，测试用它们验证「每次求值」而不是常量。 */
export interface RuntimeContextInput {
  readonly now: Date;
  readonly cwd: string;
  readonly platform: string;
  readonly osRelease: string;
  readonly timeZone: string;
}

/**
 * 渲染运行环境文本。字段与旧内核的两个 section 对齐：
 * 主工作目录、平台、shell、OS 版本、当前日期、时区。
 *
 * @param input - 本次装配的时点与宿主读数。
 * @returns 可直接作为上下文贡献的多行文本。
 */
export function renderRuntimeContext(input: RuntimeContextInput): string {
  return [
    ENVIRONMENT_TITLE,
    ENVIRONMENT_INTRO,
    `- Primary working directory: ${input.cwd}`,
    `- Platform: ${input.platform}`,
    `- Shell: ${shellNameForPlatform(input.platform)}`,
    `- OS Version: ${input.osRelease}`,
    `- ${CURRENT_DATE_PREFIX} ${localDateOf(input.now)}.`,
    `- Time zone: ${input.timeZone}.`,
  ].join("\n");
}

/**
 * 取本次装配的宿主读数。`cwd` 由调用方给出（会话有自己目录时用会话的）。
 *
 * @param cwd - 本次装配适用的工作目录。
 * @returns 已填好的渲染输入。
 */
export function currentRuntimeContextInput(cwd: string): RuntimeContextInput {
  return {
    now: new Date(),
    cwd,
    platform: process.platform,
    osRelease: release(),
    timeZone: timeZoneName(),
  };
}

/** DSH 插件行的元数据：名称与硬依赖。 */
export const name = "knorvia-runtime-context";
export const inject = ["systemPrompt"];

/**
 * 插件体：注册一个动态上下文贡献。装配时 DSH 会把 `renderContextSnapshot()`
 * 的结果放进模型历史；`text` 每次装配重新求值，因此日期和工作目录都是当下的。
 *
 * 数量级取 100：DSH 内建的运行上下文用 110/115/120，这里排在它们之前，
 * 让环境信息先出现（顺序对模型的可读性更自然）。
 *
 * @param ctx - 本插件行的 context。
 */
export function apply(ctx: Context): void {
  ctx.systemPrompt.context({
    name: RUNTIME_CONTEXT_NAME,
    order: 100,
    text: () => renderRuntimeContext(currentRuntimeContextInput(process.cwd())),
  });
}
