// SPDX-License-Identifier: Apache-2.0
// 官方插件缓存扫描：找出 CLI seed 到本地的内置官方插件及其可用版本目录。
// 内置官方插件由 CLI 直接铺到 <plugins storage>/cache/<marketplace>/<name>/<version>/，没有
// installed_plugins.json 记录；只读安装记录的服务会漏掉它们，因此这里按目录布局回扫一遍。
// 版本目录名按数字感知降序排列（2.10.0 排在 2.9.0 前），与 CLI 的回退选取保持一致。
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID } from "../plugin-marketplaces.js";

interface CachedPluginRoot {
  // 缓存目录名，即官方插件的 name。
  name: string;
  // 数字感知降序后的可用版本目录（绝对路径），首项为最新版本。
  versionRoots: string[];
}

// CLI 在写入过程中留下的备份 / seed 锁 / 临时目录都不是可用版本，扫描时跳过。
function isWritingScaffold(entryName: string): boolean {
  return (
    entryName.includes(".backup") || entryName.includes(".seed-lock") || entryName.includes(".tmp-")
  );
}

// 版本目录名的数字感知降序比较：让 2.10.0 排在 2.9.0 之前。
function newestFirst(left: string, right: string): number {
  return right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" });
}

// 列出某层下的全部目录名；目录不可读（不存在或权限不足）时按「这一层没有内容」处理。
async function listDirectories(location: string): Promise<string[]> {
  const seen = await readdir(location, { withFileTypes: true }).catch(() => []);
  return seen.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

// 扫描 <storage>/cache/<marketplace>/，返回按 name 升序的插件条目；没有任何可用版本目录的
// 插件整条不出现；缓存根缺失时返回空数组。
export async function scanOfficialPluginCacheRoots(storage: string): Promise<CachedPluginRoot[]> {
  const cacheDir = join(storage, "cache", KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID);

  const collected: CachedPluginRoot[] = [];
  for (const plugin of await listDirectories(cacheDir)) {
    const pluginFolder = join(cacheDir, plugin);
    const releases = (await listDirectories(pluginFolder))
      .filter((candidate) => !isWritingScaffold(candidate))
      .sort(newestFirst)
      .map((edition) => join(pluginFolder, edition));

    if (releases.length > 0) collected.push({ name: plugin, versionRoots: releases });
  }

  return collected.sort((left, right) => left.name.localeCompare(right.name));
}
