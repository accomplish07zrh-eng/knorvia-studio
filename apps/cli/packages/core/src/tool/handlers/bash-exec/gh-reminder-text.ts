// SPDX-License-Identifier: Apache-2.0
// gh 限流识别与提醒文案：命令形态、限流信号与系统提醒文本三件事集中在此，
// 供 bash-gh-rate-limit 的冷却门在命中时取用。
// 只认复合命令中的 gh 调用本体，跳过 auth/help/version 等不打 API 的子命令。
export const GH_CALL_SHAPE =
  /(?:^|[;&|]|\b(?:then|do)\b)\s*gh\s+(?!auth\b|help\b|version\b|alias\b|completion\b|config\b)/;

export const RATE_LIMIT_SIGNAL =
  /API rate limit (?:already )?exceeded|exceeded a secondary rate limit|\bRATE_LIMITED\b/i;

// 提醒文案分句拼装：事实、自救动作、循环场景的替代方案。
const REMINDER_LINES = [
  "GitHub API rate limit exceeded (5,000/hr shared across all tools and agents).",
  "Run `gh api rate_limit --jq .resources` and sleep until reset before further gh calls.",
  "If polling in a loop, use ScheduleWakeup instead of retrying.",
];

export function composeReminderText(): string {
  const body = REMINDER_LINES.slice().join(" ");
  return `<system-reminder>${body}</system-reminder>`;
}
