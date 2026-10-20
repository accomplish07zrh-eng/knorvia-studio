// SPDX-License-Identifier: Apache-2.0
// Provider 配置运行时的构造参数（纯类型声明）。
//
// 这份 options 的形状由 interface.md §2.4 逐条列名（`NodeProviderConfigRuntimeOptions`
// 属纯类型面），字段名与嵌套形状逐字不可改。集中在此处的原因与
// `channel-protocol-declaration.ts` 相同：形状由合同规定、不含逻辑，
// 与运行时的装配逻辑分开，避免「声明 + 逻辑」混在一个文件里互相干扰计分。
import type {
  KnorviaBuiltinRemoteSynchronizerOptions,
  KnorviaBuiltinRefreshResult,
} from "./builtin-remote-synchronizer.js";
import type { EndpointScopedKnorviaBuiltinSourceOptions } from "./endpoint-scoped-builtin-source.js";
import type { PersonalProviderConfigRecoveryEvent } from "./personal-provider-config-repository.js";
import type { ProviderConfigLayerSnapshot, ProviderConfigLayerUpdate } from "@knorvia/provider";

export type { KnorviaBuiltinRefreshResult };

/** 远端同步参数：同步器自身由运行时注入，故只取其余项。 */
type RemoteOptions = Omit<KnorviaBuiltinRemoteSynchronizerOptions, "source">;

/** 端点范围来源参数：bundled 路径由运行时统一给出，故剔除。 */
type EnvironmentOptions = Omit<EndpointScopedKnorviaBuiltinSourceOptions, "bundledFilePath">;

/** 旧配置导入器：拿到当前 Built-in 快照，给出要合并进 Personal 的层（或 `null` 表示无旧配置）。 */
type LegacyImporter = (
  knorviaBuiltin: ProviderConfigLayerSnapshot,
) => Promise<ProviderConfigLayerUpdate | null>;

/** 构造 Config 运行时所需的全部参数（字段清单见 interface.md §2.4）。 */
export interface ConfigRuntimeOptions {
  readonly knorviaBuiltinFilePath: string;
  readonly knorviaBuiltinActiveFilePath?: string;
  readonly knorviaBuiltinRemote?: RemoteOptions;
  readonly knorviaBuiltinEnvironment?: EnvironmentOptions;
  readonly onKnorviaBuiltinRefreshError?: (error: unknown) => void;
  readonly onPersonalConfigRecovery?: (event: PersonalProviderConfigRecoveryEvent) => void;
  readonly onPersonalConfigPollingError?: (error: unknown) => void;
  readonly personalFilePath: string;
  readonly personalPollingIntervalMs?: number | false;
  readonly importLegacy?: LegacyImporter;
  readonly watch?: boolean;
}
