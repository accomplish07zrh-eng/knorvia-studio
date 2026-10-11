// SPDX-License-Identifier: Apache-2.0
// Bash 超时策略解析。
//
// 规则：
// 1. 两个环境变量各自独立读取，只接受十进制正整数；空串、非数字与 <= 0 都按「没配」处理，
//    回落到内置默认值而不是抛错——调用方拿到的一定是一份可用策略。
// 2. 上限永远不低于本次生效的默认值，所以配置里出现 default > max 时不会产生自相矛盾的策略。
// 3. 单次调用的超时先取调用方给的值（0 与 NaN 视为没给），再夹到上限。
//
// 读取与校验只发生在这一个模块里；调用点不再各判一遍环境变量。
//
// 与调用点的分工：调用点只关心「这次要等多久」，策略解析、非法值兜底与上限夹取都在这里完成，
// 因此任何调用点都不会因为环境变量写错而拿到 0 或 NaN 超时。

export interface BashTimeoutPolicy {
  /** 调用方没给超时时使用的默认值。 */
  defaultTimeoutMs: number;
  /** 单次调用的硬上限：默认值与调用方给的值都不会超过它。 */
  maxTimeoutMs: number;
}

const FALLBACK_TIMEOUT_MS = 120_000;
const FALLBACK_MAX_TIMEOUT_MS = 600_000;
const DEFAULT_TIMEOUT_KEY = "BASH_DEFAULT_TIMEOUT_MS";
const MAX_TIMEOUT_KEY = "BASH_MAX_TIMEOUT_MS";

export const DEFAULT_BASH_TIMEOUT_MS = FALLBACK_TIMEOUT_MS;
export const DEFAULT_BASH_MAX_TIMEOUT_MS = FALLBACK_MAX_TIMEOUT_MS;
export const DEFAULT_BASH_TIMEOUT_POLICY: BashTimeoutPolicy = buildPolicy(
  FALLBACK_TIMEOUT_MS,
  FALLBACK_MAX_TIMEOUT_MS,
);

/** 把两个时长收成一份策略，并保证上限不低于默认值。 */
function buildPolicy(defaultMs: number, maxMs: number): BashTimeoutPolicy {
  return { defaultTimeoutMs: defaultMs, maxTimeoutMs: Math.max(defaultMs, maxMs) };
}

/** 读一个十进制正整数时长；空串、非数字与 <= 0 一律返回 undefined。 */
function readDuration(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
): number | undefined {
  const raw = env[key]?.trim();
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return parsed > 0 ? parsed : undefined;
}

export function resolveBashTimeoutPolicy(
  env: Readonly<Record<string, string | undefined>>,
): BashTimeoutPolicy {
  const configuredDefaultMs = readDuration(env, DEFAULT_TIMEOUT_KEY);
  const configuredMaxMs = readDuration(env, MAX_TIMEOUT_KEY);
  return buildPolicy(
    configuredDefaultMs ?? FALLBACK_TIMEOUT_MS,
    configuredMaxMs ?? FALLBACK_MAX_TIMEOUT_MS,
  );
}

/** 夹到上限：恰好等于上限时保持原值。 */
function clampToMax(value: number, max: number): number {
  return value > max ? max : value;
}

export function resolveBashTimeoutMs(
  inputTimeoutMs: number | undefined,
  policy: BashTimeoutPolicy,
): number {
  const requestedMs = inputTimeoutMs ? inputTimeoutMs : policy.defaultTimeoutMs;
  return clampToMax(requestedMs, policy.maxTimeoutMs);
}
