// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 用户环境快照在 DSH 树里的传递方式：作为宿主提供的服务挂到根 context 上，
// 让带快照的 shell 执行器在构造时读到它。
//
// 为什么不用组合行的 config 传：执行器的 Config 由 DSH 的 schemastery 校验，
// 未知键不会变成构造参数（实测反例见 acceptance.md §六 E3）；而 `boot()` 的
// `prepare(ctx)` 在配置树挂载前运行，正好是提供宿主服务的位置。
//
// 契约见 specs/contracts/kernel-dsh-builtins/interface.md §二/§三。

import type { Context } from "@deepseek-ai/cordis";
import type { KernelUserEnvironmentSnapshot } from "./user-environment.js";

/** 服务名。用 Knorvia 前缀避免与 DSH 服务命名冲突。 */
const KERNEL_USER_ENVIRONMENT_SERVICE = "knorviaUserEnvironment";

/**
 * 把快照注册成根 context 的服务。
 *
 * @param ctx - `boot()` 在挂载配置树前交出的根 context。
 * @param snapshot - 启动时点的用户环境快照。
 */
export function provideUserEnvironment(
  ctx: Context,
  snapshot: KernelUserEnvironmentSnapshot,
): void {
  ctx.provide(KERNEL_USER_ENVIRONMENT_SERVICE, snapshot);
}

/**
 * 读回快照。执行器在构造时调用；服务缺席说明宿主没走内核路径，
 * 此时按空快照处理——执行器仍然可用，只是不额外注入用户环境。
 *
 * @param ctx - 执行器所属的 context。
 * @returns 用户环境快照；缺席时返回空快照。
 */
export function readUserEnvironment(ctx: Context): KernelUserEnvironmentSnapshot {
  const provided = ctx.get(KERNEL_USER_ENVIRONMENT_SERVICE) as
    | KernelUserEnvironmentSnapshot
    | undefined;
  if (provided !== undefined) return provided;
  return EMPTY_USER_ENVIRONMENT;
}

/** 空快照：没有键、读什么都拿不到。单例，避免每次构造。 */
const EMPTY_USER_ENVIRONMENT: KernelUserEnvironmentSnapshot = {
  get: () => undefined,
  names: () => [],
  size: 0,
};
