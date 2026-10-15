// SPDX-License-Identifier: Apache-2.0
// CUA 插件 id 的规范形式与别名表：旧 id 只作为读入兼容存在。
export const LEGACY_CUA_PLUGIN_ID = "cua@knorvia-plugins-bundled";
export const CANONICAL_CUA_PLUGIN_ID = "computer-use@knorvia-plugins-bundled";

export function canonicalizePluginId(pluginId: string): string {
  return pluginId === LEGACY_CUA_PLUGIN_ID ? CANONICAL_CUA_PLUGIN_ID : pluginId;
}

/** 别名表首项永远是规范 id；只有 CUA 插件有两个别名。 */
export function pluginIdAliases(pluginId: string): readonly string[] {
  if (canonicalizePluginId(pluginId) !== CANONICAL_CUA_PLUGIN_ID) return [pluginId];
  return [CANONICAL_CUA_PLUGIN_ID, LEGACY_CUA_PLUGIN_ID];
}
