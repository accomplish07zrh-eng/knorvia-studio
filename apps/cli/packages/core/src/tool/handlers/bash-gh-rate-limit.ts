// SPDX-License-Identifier: Apache-2.0
// gh 限流提示：命令输出里出现 GitHub API 限流文案时，向模型注入一段系统提醒；
// 同一进程每个冷却窗口只发一次，避免循环轮询时反复刷屏。
// （本模块有模块级冷却时间戳，是单会话内唯一可变状态；见 behavior.md B-ex-21。）
import {
  GH_CALL_SHAPE,
  RATE_LIMIT_SIGNAL,
  composeReminderText,
} from "./bash-exec/gh-reminder-text.js";

const HINT_COOLDOWN_MS = 60_000;

let cooldownUntil = 0;

export function getGhRateLimitHint(cmd: string, producedText: string): string | undefined {
  const observedAt = Date.now();
  const suppressed =
    observedAt < cooldownUntil || !GH_CALL_SHAPE.test(cmd) || !RATE_LIMIT_SIGNAL.test(producedText);
  if (suppressed) return undefined;
  cooldownUntil = observedAt + HINT_COOLDOWN_MS;
  return composeReminderText();
}
