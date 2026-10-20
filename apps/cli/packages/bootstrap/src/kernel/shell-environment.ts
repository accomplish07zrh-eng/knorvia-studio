// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// Knorvia 的 shell 执行器：DSH 官方执行器的子类，只改「子进程拿到什么环境」。
// 官方执行器在 spawn 前把 `spec.dshEnv`（DSH 托管命名空间）叠在用户 env 之上，
// 且底座的隐式继承会清掉凭据形变量；这两点都不符合内核合同：
//   - 用户项目脚本要拿到用户启动应用时的环境（只去掉 DSH_*）；
//   - DSH 托管命名空间不得进入用户项目脚本。
// 因此这里在 resolve() 之后重写环境：快照打底、调用方显式 env 覆盖、丢弃 dshEnv。
//
// 契约见 specs/contracts/kernel-dsh-builtins/interface.md §三（R1-R6、B9-B13）。

import type { Context } from "@deepseek-ai/cordis";
import { type Config as BashConfig, LocalBashExecutor } from "@deepseek-ai/dsh-bash-local";
import { type Config as PwshConfig, PwshLocalExecutor } from "@deepseek-ai/dsh-pwsh-local";
import type { ShellExecRequest, ShellExecSpec } from "@deepseek-ai/dsh-shell";
import type { KernelUserEnvironmentSnapshot } from "./user-environment.js";
import { materializeSnapshot } from "./user-environment.js";
import { readUserEnvironment } from "./user-environment-service.js";

/**
 * 把用户快照与调用方显式 env 合成为子进程环境。
 *
 * 合并顺序固定：先快照，再显式 env。调用方显式给出的条目（例如工具层补充的变量）
 * 优先，这与 DSH 官方执行器「显式层在底座之上」的口径一致。
 *
 * @param snapshot - 启动时点的用户环境快照。
 * @param explicit - 调用方在 spec 上给出的显式环境。
 * @returns 子进程环境。
 */
function composeChildEnvironment(
  snapshot: KernelUserEnvironmentSnapshot,
  explicit: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const composed = materializeSnapshot(snapshot);
  if (explicit !== undefined) {
    for (const [name, value] of Object.entries(explicit)) composed[name] = value;
  }
  return composed;
}

/**
 * 抹掉 DSH 托管命名空间并注入用户快照。
 *
 * 官方执行器把 `dshEnv` 叠在 env 之上；技能工具与 job 工具都不消费用户环境，
 * 只有用户项目脚本会受影响，所以这一层改写对所有执行路径都成立。
 *
 * @param spec - owner 执行器 resolve 出来的完整规格。
 * @param snapshot - 启动时点的用户环境快照。
 * @returns 环境已重写的新规格；其它字段原样。
 */
export function rewriteShellSpecEnvironment(
  spec: ShellExecSpec,
  snapshot: KernelUserEnvironmentSnapshot,
): ShellExecSpec {
  const rewritten: ShellExecSpec = { ...spec, env: composeChildEnvironment(snapshot, spec.env) };
  // dshEnv 是官方执行器管理 DSH_* 事实的通道；用户项目脚本不该看到这些事实。
  delete rewritten.dshEnv;
  return rewritten;
}

/**
 * POSIX 平台的 shell 执行器：官方 bash 执行器的子类。
 *
 * 组合里用本类顶替官方执行器行（同一行 id），因此一个 context 仍只有一个
 * `ctx.shell` 实现（README G2）。
 *
 * 注意：`ctx.shell` 会被 Cordis 包一层 Proxy 暴露给消费者，Proxy 读不到 `#private`
 * 字段；所以快照必须放在 `protected` 字段上（实测：用 `#snapshot` 会在
 * `ctx.get("shell").resolve()` 抛「Cannot read private member」）。
 */
export class SnapshotBashExecutor extends LocalBashExecutor {
  protected readonly snapshot: KernelUserEnvironmentSnapshot;

  /**
   * @param ctx - Cordis context，由组合创建；快照从这里提供的宿主服务读取。
   * @param config - 官方执行器配置，逐字段透传。
   */
  constructor(ctx: Context, config: BashConfig) {
    super(ctx, config);
    this.snapshot = readUserEnvironment(ctx);
  }

  override resolve(request: ShellExecRequest): ShellExecSpec {
    return rewriteShellSpecEnvironment(super.resolve(request), this.snapshot);
  }
}

/**
 * Windows 平台的 shell 执行器：官方 pwsh 执行器的子类。语义与
 * {@link SnapshotBashExecutor} 相同，只是底层可执行文件不同。
 */
export class SnapshotPwshExecutor extends PwshLocalExecutor {
  protected readonly snapshot: KernelUserEnvironmentSnapshot;

  /**
   * @param ctx - Cordis context，由组合创建；快照从这里提供的宿主服务读取。
   * @param config - 官方执行器配置，逐字段透传。
   */
  constructor(ctx: Context, config: PwshConfig) {
    super(ctx, config);
    this.snapshot = readUserEnvironment(ctx);
  }

  override resolve(request: ShellExecRequest): ShellExecSpec {
    return rewriteShellSpecEnvironment(super.resolve(request), this.snapshot);
  }
}
