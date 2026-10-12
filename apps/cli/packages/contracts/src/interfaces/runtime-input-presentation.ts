// SPDX-License-Identifier: Apache-2.0
// 运行时输入的呈现标记：说明一条输入从哪儿来、在会话里该按什么形态被消费。
// 取值表与校验器归本文件，写入方（会话运行时）在入队时打标；历史里缺标记的旧输入不做追溯转换。

// ── 章节：一 取值表与校验器 · 二 解析入口 · 三 对外类型

import { z } from "zod";

// ── 一、取值表与校验器 ──────────────────────────────────────────────

/** 允许出现的呈现取值，书写顺序即 schema 的成员顺序；增删取值都会改动协议面。 */
const RUNTIME_INPUT_PRESENTATIONS = [
  "user_steer",
  "coordinator_steer",
  "coordinator_input",
  "subagent_reply_steer",
  "subagent_reply",
  "task_notification_steer",
  "task_notification",
] as const;

/** 队列条目的呈现标记校验器；未标注的旧历史按缺失处理，不回填。 */
export const RuntimeInputPresentationSchema = z.enum(RUNTIME_INPUT_PRESENTATIONS);

// ── 二、解析入口 ────────────────────────────────────────────────────

/** 宽松解析：取值合法就交回标记，否则交回 undefined，让读旧数据的一方按「没有标记」处理。 */
export function parseRuntimeInputPresentation(
  value: unknown,
): RuntimeInputPresentation | undefined {
  const parsed = RuntimeInputPresentationSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

// ── 三、对外类型 ────────────────────────────────────────────────────

/** 呈现标记的联合类型，取值与上面的表一一对应。 */
export type RuntimeInputPresentation = z.infer<typeof RuntimeInputPresentationSchema>;
