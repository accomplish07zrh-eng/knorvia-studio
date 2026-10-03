import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function readInstalledPluginRoots(
  pluginStorageRoot: string,
): Promise<Array<{ defaultEnabled: boolean; marketplace: string; rootPath: string }>> {
  let index: unknown;
  try {
    const source = await readFile(join(pluginStorageRoot, "installed_plugins.json"), "utf8");
    index = JSON.parse(source);
  } catch {
    return [];
  }

  if (!isRecord(index) || !Array.isArray(index.plugins)) {
    return [];
  }

  const roots: Array<{ defaultEnabled: boolean; marketplace: string; rootPath: string }> = [];
  for (const plugin of index.plugins) {
    if (!isRecord(plugin)) {
      continue;
    }

    const id = trimmedString(plugin.id);
    const marketplace = trimmedString(plugin.marketplace);
    const rootPath = trimmedString(plugin.installPath);
    if (!id || !marketplace || !rootPath || !isAbsolute(rootPath)) {
      continue;
    }

    roots.push({ defaultEnabled: false, marketplace, rootPath });
  }

  return roots;
}
