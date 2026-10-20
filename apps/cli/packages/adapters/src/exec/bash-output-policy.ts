// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// bash 内联输出上限的解析。上限有两个来源：环境变量覆盖值与请求侧回退值；
// 环境变量存在时优先，且无论取自哪个来源，最终都要按封顶值收敛。
// 这里不读配置、不写日志，纯函数便于在适配器基类里反复调用。

const INLINE_LIMIT_DEFAULT = 30_000;
const INLINE_LIMIT_CAP = 150_000;

type InlineLimitAsk = {
  env: NodeJS.ProcessEnv;
  requested?: number;
};

/** 请求侧回退：非负有限数才认，并按封顶值收敛。 */
function fromRequest(requested: number | undefined): number {
  const usable = requested !== undefined && Number.isFinite(requested) && requested >= 0;
  return usable ? Math.min(requested, INLINE_LIMIT_CAP) : INLINE_LIMIT_DEFAULT;
}

/** 环境变量侧：空串与非法值退回默认值，合法值取整后封顶。 */
function fromEnvironment(raw: string): number {
  if (raw.trim().length === 0) return INLINE_LIMIT_DEFAULT;
  const parsed = Number(raw);
  const usable = Number.isFinite(parsed) && parsed > 0;
  return usable ? Math.min(Math.floor(parsed), INLINE_LIMIT_CAP) : INLINE_LIMIT_DEFAULT;
}

export function resolveBashMaxOutputLength(ask: InlineLimitAsk): number {
  const override = ask.env.BASH_MAX_OUTPUT_LENGTH;
  return override === undefined ? fromRequest(ask.requested) : fromEnvironment(override);
}
