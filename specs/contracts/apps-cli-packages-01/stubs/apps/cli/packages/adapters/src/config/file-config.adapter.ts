// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export function resolvePath(path: string): string {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function getDefaultConfigPath(): string {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function hasDefaultConfigFile(): boolean {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function loadFileConfig(filePath?: string, options: FileConfigOptions = {}): LoadedConfig {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function updateUiLocaleInFileConfig(
  filePath: string,
  locale: UiLocale,
): Promise<UiLocalePatchResult> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function updatePluginEnabledInFileConfig(
  filePath: string,
  pluginId: string,
  enabled: boolean,
): Promise<PluginEnabledPatchResult> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function enablePluginsByDefaultInFileConfig(
  filePath: string,
  pluginIds: readonly string[],
): Promise<{ enabledIds: string[]; path: string }> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function updatePluginOptionsInFileConfig(
  filePath: string,
  pluginId: string,
  options: Record<string, string | number | boolean>,
  clearOptionKeys: string[] = [],
): Promise<PluginOptionsPatchResult> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function removePluginFromFileConfig(
  filePath: string,
  pluginId: string,
): Promise<PluginRemovePatchResult> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function removePluginEnabledFromFileConfig(
  filePath: string,
  pluginId: string,
): Promise<{ path: string; pluginId: string; removedEnabled: boolean }> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function addSuppressedBuiltinInFileConfig(
  filePath: string,
  pluginId: string,
): Promise<SuppressedBuiltinPatchResult> {
  throw new Error("not implemented: apps-cli-packages-01");
}

export async function removeSuppressedBuiltinInFileConfig(
  filePath: string,
  pluginId: string,
): Promise<SuppressedBuiltinPatchResult> {
  throw new Error("not implemented: apps-cli-packages-01");
}
