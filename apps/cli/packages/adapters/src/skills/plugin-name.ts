// SPDX-License-Identifier: Apache-2.0
// 插件名解析：从技能根向上最多 5 层查找插件清单，取其中的 name。
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** 支持四种清单目录，按此顺序尝试。 */
const MANIFEST_DIRECTORIES: readonly string[] = [
  ".knorvia-plugin",
  ".claude-plugin",
  ".codex-plugin",
  ".cursor-plugin",
];
const MANIFEST_FILE = "plugin.json";
const DEPTH_LIMIT = 5;

async function nameIn(directory: string): Promise<string | undefined> {
  for (const marker of MANIFEST_DIRECTORIES) {
    const manifestPath = join(directory, marker, MANIFEST_FILE);
    const parsed = await readFile(manifestPath, "utf8").then(
      (text) => JSON.parse(text) as unknown,
      () => undefined,
    );
    if (parsed === null || typeof parsed !== "object") continue;
    const name = (parsed as { name?: unknown }).name;
    if (typeof name === "string" && name.trim().length > 0) return name.trim();
  }
  return undefined;
}

/** 清单缺失或损坏都不算错误：继续向上找。 */
export async function resolvePluginName(rootPath: string): Promise<string | undefined> {
  let directory = resolve(rootPath);
  for (let depth = 0; depth <= DEPTH_LIMIT; depth += 1) {
    const found = await nameIn(directory);
    if (found !== undefined) return found;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
  return undefined;
}
