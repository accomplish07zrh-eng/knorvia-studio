// SPDX-License-Identifier: Apache-2.0
// 配置模块公开面：配置端口的两个导出 + 各适配器/工厂的再导出；实现在 store/defaults/port。
import type { ConfigPort, RuntimeConfigPatch } from "@knorvia/contracts";
import { ConfigPortImpl } from "./port.js";

export { ConfigPortImpl };
export type { ConfigPort };

export function createConfigPort(initial?: RuntimeConfigPatch): ConfigPort {
  return new ConfigPortImpl(initial);
}

// Re-export adapters and factory
export {
  loadFileConfig,
  getDefaultConfigPath,
  hasDefaultConfigFile,
  resolvePath,
  updatePluginEnabledInFileConfig,
  enablePluginsByDefaultInFileConfig,
  removePluginEnabledFromFileConfig,
  updatePluginOptionsInFileConfig,
  removePluginFromFileConfig,
  addSuppressedBuiltinInFileConfig,
  removeSuppressedBuiltinInFileConfig,
  updateUiLocaleInFileConfig,
  type PluginEnabledPatchResult,
  type PluginOptionsPatchResult,
  type PluginRemovePatchResult,
  type SuppressedBuiltinPatchResult,
  type UiLocalePatchResult,
} from "./file-config.adapter.js";
export { parseEnvConfig, getToolConcurrencyConfig } from "./env-config.adapter.js";
export { KnorviaConfigFileSchema, type KnorviaConfigFile } from "./schema.js";
export { mergeConfigs, createPrioritizedConfig, getScopePriority } from "./config-merger.js";
export {
  createConfig,
  resolveWorkspaceStorageDir,
  type ConfigFactoryOptions,
  type ConfigResult,
} from "./config-factory.js";
