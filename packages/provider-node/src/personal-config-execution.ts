// SPDX-License-Identifier: Apache-2.0
// 仓储公开方法的包装层：把「无论成败都要武装轮询」与「读取失败要恢复」这两条
// 横切规则从方法体里提出来，方法本身只剩一次委托。
//
// 为什么值得单独成模块：这两条规则对 read/update 都成立，且都必须覆盖
// 「提前返回」与「抛错」两条出口。写在每个方法里既重复，也容易漏掉 finally。
import type { ProviderConfigLayerSnapshot, ProviderConfigLayerUpdate } from "@knorvia/provider";
import type { PersonalProviderConfigRecoveryEvent } from "./personal-config-repository-contract.js";
import { emptyLayer, snapshotOf } from "./personal-config-disk-store.js";

/** 包装所需的协作者；由仓储提供。 */
export interface RepositoryExecutionHooks {
  /** 刷新轮询安排（每次公开方法结束都要调用）。 */
  readonly armPolling: () => void;
  /** 恢复事件回调（读取失败时调用）。 */
  readonly reportRecovery: (event: PersonalProviderConfigRecoveryEvent) => void;
  /** 记录首次观察到的 revision。 */
  readonly remember: (revision: string) => void;
  /** 实际读取。 */
  readonly read: () => Promise<ProviderConfigLayerSnapshot>;
  /** 实际写回。 */
  readonly update: (
    transform: (current: ProviderConfigLayerSnapshot) => ProviderConfigLayerUpdate,
  ) => Promise<ProviderConfigLayerSnapshot>;
  /** 写回成功后的通知。 */
  readonly notifyUpdated: () => void;
  /** 记录最新 revision。 */
  readonly observe: (revision: string) => void;
}

/**
 * 执行一次读取。
 *
 * 失败路径的两个约束：
 *   · 恢复回调抛错不能替换原始读取结果，所以单独 try/catch 包住它；
 *   · 永远返回可用快照（空层），让调用方在损坏文件上也能启动。
 */
export async function runRead(
  hooks: RepositoryExecutionHooks,
): Promise<ProviderConfigLayerSnapshot> {
  try {
    const layer = await hooks.read();
    hooks.remember(layer.revision);
    return layer;
  } catch (fault) {
    try {
      hooks.reportRecovery(Object.freeze({ error: fault }));
    } catch {
      /* 恢复回调只做观察。 */
    }
    const fallback = snapshotOf(emptyLayer());
    hooks.remember(fallback.revision);
    return fallback;
  } finally {
    // 无论成功、失败还是提前返回，都要重新武装轮询。
    hooks.armPolling();
  }
}

/**
 * 执行一次写回。
 *
 * 写回成功后先记 revision 再广播：订阅者收到 `updated` 时读到的
 * `#observedRevision` 必须已经是新值，否则它们紧接着的读取会被自己判成外部变更。
 */
export async function runUpdate(
  hooks: RepositoryExecutionHooks,
  transform: (current: ProviderConfigLayerSnapshot) => ProviderConfigLayerUpdate,
): Promise<ProviderConfigLayerSnapshot> {
  try {
    const committed = await hooks.update(transform);
    hooks.observe(committed.revision);
    hooks.notifyUpdated();
    return committed;
  } finally {
    hooks.armPolling();
  }
}
