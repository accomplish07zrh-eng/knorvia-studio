// SPDX-License-Identifier: Apache-2.0
// 配置工厂公开面：只留签名与转发，装配见 factory-assembly，存储目录见 factory-storage。
import { assembleConfig } from "./factory-assembly.js";
import {
  resolveWorkspaceStorageDir as resolveStorageDir,
  type StorageDirInput,
} from "./factory-storage.js";
import type { ConfigFactoryOptions, ConfigResult } from "./factory-types.js";

export type { ConfigFactoryOptions, ConfigResult } from "./factory-types.js";
export type {
  McpServerConfigSource,
  PluginConfigScope,
  PluginConfigSources,
} from "./factory-sources.js";

export function createConfig(options: ConfigFactoryOptions = {}): ConfigResult {
  return assembleConfig(options);
}

export function resolveWorkspaceStorageDir(input: StorageDirInput): string {
  return resolveStorageDir(input);
}
