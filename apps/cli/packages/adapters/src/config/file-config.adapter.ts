// SPDX-License-Identifier: Apache-2.0
// 配置文件适配器：公开面只做签名与转发，实现见 file-config-ops.ts。
import type { UiLocale } from "@knorvia/contracts";
import type { ConfigDiagnostic } from "./schema.js";
import {
  addSuppressedBuiltin,
  deletePlugin,
  deletePluginEnabled,
  enablePluginIdsByDefault,
  getDefaultConfigPath,
  hasDefaultConfigFile,
  loadConfigFile,
  patchPluginEnabled,
  patchPluginOptions,
  patchUiLocale,
  removeSuppressedBuiltin,
  resolvePath,
  type FileLoadOptions,
  type FileLoadResult,
} from "./file-config-ops.js";

export interface FileConfigOptions extends FileLoadOptions {}

export interface LoadedConfig extends FileLoadResult {}

export interface UiLocalePatchResult {
  locale: UiLocale;
  path: string;
}

export interface PluginEnabledPatchResult {
  enabled: boolean;
  path: string;
  pluginId: string;
}

export interface PluginOptionsPatchResult {
  clearedOptionKeys: string[];
  options: Record<string, string | number | boolean>;
  path: string;
  pluginId: string;
}

export interface PluginRemovePatchResult {
  path: string;
  pluginId: string;
  removedEnabled: boolean;
  removedOptions: boolean;
}

export interface SuppressedBuiltinPatchResult {
  path: string;
  pluginId: string;
  suppressed: boolean;
}

export { getDefaultConfigPath, hasDefaultConfigFile, resolvePath };

export function loadFileConfig(
  filePath: string | undefined,
  options: FileConfigOptions = {},
): LoadedConfig {
  return loadConfigFile(filePath, options);
}

export async function updateUiLocaleInFileConfig(
  filePath: string,
  locale: UiLocale,
): Promise<UiLocalePatchResult> {
  return await patchUiLocale({ filePath, locale });
}

export async function updatePluginEnabledInFileConfig(
  filePath: string,
  pluginId: string,
  enabled: boolean,
): Promise<PluginEnabledPatchResult> {
  return await patchPluginEnabled({ enabled, filePath, pluginId });
}

export async function enablePluginsByDefaultInFileConfig(
  filePath: string,
  pluginIds: readonly string[],
): Promise<{ enabledIds: string[]; path: string }> {
  return await enablePluginIdsByDefault({ filePath, pluginIds });
}

export async function updatePluginOptionsInFileConfig(
  filePath: string,
  pluginId: string,
  options: Record<string, string | number | boolean>,
  clearOptionKeys: string[] = [],
): Promise<PluginOptionsPatchResult> {
  return await patchPluginOptions({ clearOptionKeys, filePath, options, pluginId });
}

export async function removePluginFromFileConfig(
  filePath: string,
  pluginId: string,
): Promise<PluginRemovePatchResult> {
  return await deletePlugin({ filePath, pluginId });
}

export async function removePluginEnabledFromFileConfig(
  filePath: string,
  pluginId: string,
): Promise<{ path: string; pluginId: string; removedEnabled: boolean }> {
  return await deletePluginEnabled({ filePath, pluginId });
}

export async function addSuppressedBuiltinInFileConfig(
  filePath: string,
  pluginId: string,
): Promise<SuppressedBuiltinPatchResult> {
  return await addSuppressedBuiltin({ filePath, pluginId });
}

export async function removeSuppressedBuiltinInFileConfig(
  filePath: string,
  pluginId: string,
): Promise<SuppressedBuiltinPatchResult> {
  return await removeSuppressedBuiltin({ filePath, pluginId });
}

export type { ConfigDiagnostic };
