// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 启动时点的用户环境快照：工具子进程要用「用户启动这个应用时的环境」，不是 DSH 的，
// 也不是内核清洗之后的。内核在 DSH 与模型适配这一侧会删掉凭据形变量，那个动作不能
// 波及用户自己的项目脚本，所以快照必须在清洗之前拍下，并单独传给 shell 执行器。
//
// 契约见 specs/contracts/kernel-dsh-builtins/interface.md §二/§三（B9-B13）。

/** DSH 保留的变量前缀；快照不收录，工具子进程也不该看见。 */
const DSH_ENVIRONMENT_PREFIX = "DSH_";

/** Windows 的环境名大小写不敏感，读取与判定都按大写比较。 */
const CASE_INSENSITIVE_ENVIRONMENT = process.platform === "win32";

/** 与平台无关的「这个名字是不是 DSH 私有」判定。 */
function isHarnessOwnedName(name: string): boolean {
  return name.toUpperCase().startsWith(DSH_ENVIRONMENT_PREFIX);
}

/**
 * 冻结的用户环境视图。对外只提供按名读取、键名清单与条目数：没有遍历键值的公开入口，
 * 避免调用方把整份环境（可能含凭据）扩散进日志或协议面。
 *
 * `names()` 是合同要求的诊断面，也是本模块自己摊平实现时的依据——用键名清单而不是
 * `instanceof` 判断「这是不是一个快照」，否则源码入口与 dist 入口各持一份类对象时
 * 判断会失效（两个入口的实例互相认不出对方）。
 */
export interface KernelUserEnvironmentSnapshot {
  /** 读取启动时点的值；启动时不存在或属于 DSH 私有命名空间时为 undefined。 */
  get(name: string): string | undefined;
  /** 快照覆盖的变量名；只用于诊断与断言，不得据此输出键值。 */
  names(): readonly string[];
  /** 快照条目数；只用于诊断与断言，不含键名。 */
  readonly size: number;
}

/** 真实快照：条目在建好那一刻就冻结，后续 process.env 变更不再影响它。 */
class FrozenUserEnvironment implements KernelUserEnvironmentSnapshot {
  readonly #entries: ReadonlyMap<string, string>;
  /** 键名清单在建好时算一次；快照本身不可变，因此可以安全复用。 */
  readonly #names: readonly string[];
  readonly size: number;

  constructor(entries: ReadonlyMap<string, string>) {
    this.#entries = entries;
    this.#names = [...entries.keys()];
    this.size = entries.size;
  }

  get(name: string): string | undefined {
    const exact = this.#entries.get(name);
    if (exact !== undefined) return exact;
    if (!CASE_INSENSITIVE_ENVIRONMENT) return undefined;
    const wanted = name.toUpperCase();
    for (const [candidate, value] of this.#entries) {
      if (candidate.toUpperCase() === wanted) return value;
    }
    return undefined;
  }

  names(): readonly string[] {
    return this.#names;
  }
}

/**
 * 从一份启动时环境构造快照。纯函数，不读 process.env——时点由调用方决定，
 * 这样才能保证它严格早于内核的进程级清洗。
 *
 * @param source - 启动时点的环境（通常是清洗前的一次进程环境读）。
 * @returns 只读快照；空值与 DSH 私有名都不收录。
 */
export function createUserEnvironmentSnapshot(
  source: Readonly<Record<string, string | undefined>>,
): KernelUserEnvironmentSnapshot {
  const entries = new Map<string, string>();
  for (const [name, rawValue] of Object.entries(source)) {
    if (rawValue === undefined) continue;
    if (isHarnessOwnedName(name)) continue;
    entries.set(name, rawValue);
  }
  return new FrozenUserEnvironment(new Map(entries));
}

/**
 * 把快照摊平成子进程可用的环境对象。执行器在发起 spawn 前调用一次，
 * 返回值是新对象，可以安全地再叠加调用方的显式 env。
 *
 * 只依赖契约里的 `names()` 与 `get()`，因此对任何符合
 * {@link KernelUserEnvironmentSnapshot} 的实现都成立——包括由另一个模块实例
 * （源码入口与 dist 入口）创建的实例。
 *
 * @param snapshot - 启动时点的用户环境。
 * @returns 新的环境对象。
 */
export function materializeSnapshot(
  snapshot: KernelUserEnvironmentSnapshot,
): Record<string, string> {
  const materialized: Record<string, string> = {};
  for (const name of snapshot.names()) {
    const value = snapshot.get(name);
    if (value !== undefined) materialized[name] = value;
  }
  return materialized;
}
