// SPDX-License-Identifier: Apache-2.0
// Personal provider 配置仓储的构造参数与事件形状。
//
// 这些形状由 interface.md 冻结（`NodePersonalProviderConfigRepositoryOptions`、
// `PersonalProviderConfigRecoveryEvent` 属 2.2 纯类型面），签名逐字不可改。
// 单独成模块的理由：它们是「调用方如何配置仓储」的契约，
// 与仓储内部的读改写/轮询/锁逻辑变更频率不同。
import type { ProviderConfigLayerUpdate } from "@knorvia/provider";

export interface NodePersonalProviderConfigRepositoryOptions {
  readonly filePath: string;
  readonly importLegacy?: () => Promise<ProviderConfigLayerUpdate | null>;
  readonly onRecovery?: (event: PersonalProviderConfigRecoveryEvent) => void;
  readonly onPollingError?: (error: unknown) => void;
  readonly pollingIntervalMs?: number | false;
}

/** 从损坏或不一致状态恢复时上报的事件；`error` 是引发恢复的原始原因。 */
export interface PersonalProviderConfigRecoveryEvent {
  readonly error: unknown;
}
