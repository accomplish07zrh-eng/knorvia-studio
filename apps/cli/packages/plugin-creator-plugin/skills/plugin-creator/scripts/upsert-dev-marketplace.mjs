import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { preflightPlugin } from "./validate-plugin.mjs";
import { atomicJson, exists, marketplacePlan, withMarketplaceLock } from "./marketplace-files.mjs";

export async function upsertDevMarketplace({ pluginPath, marketplacePath, displayName, nameZh, descriptionZh }) {
  const root = resolve(pluginPath);
  const problems = await preflightPlugin(root);
  if (problems.length) throw new Error(problems.join("\n"));
  const manifest = JSON.parse(await readFile(join(root, ".knorvia-plugin/plugin.json"), "utf8"));
  if (basename(root) !== manifest.name) throw new Error("Plugin directory and manifest name must match");
  const path = resolve(marketplacePath ?? join(dirname(root), "marketplace.json"));
  await marketplacePlan(path, root, manifest.name, true, true);
  return withMarketplaceLock(path, async () => {
    const old = await exists(path) ? JSON.parse(await readFile(path, "utf8")) : undefined;
    const market = await marketplacePlan(path, root, manifest.name, true, true);
    const entry = market.plugins.find((item) => item.name === manifest.name);
    Object.assign(entry, { version: manifest.version, description: manifest.description ?? "", displayName: displayName ?? entry.displayName ?? manifest.name });
    if (nameZh) entry.displayName_i18n = { ...entry.displayName_i18n, "zh-CN": nameZh };
    if (descriptionZh) entry.description_i18n = { ...entry.description_i18n, "zh-CN": descriptionZh };
    const changed = JSON.stringify(old) !== JSON.stringify(market);
    if (changed) await atomicJson(path, market);
    return { marketplaceId: market.name, marketplaceRoot: dirname(path), marketplacePath: path, pluginId: `${manifest.name}@${market.name}`, pluginPath: root, version: manifest.version, changed };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    "marketplace-path": { type: "string" }, "display-name": { type: "string" }, "name-zh": { type: "string" }, "description-zh": { type: "string" },
  } });
  Promise.resolve().then(() => {
    if (positionals.length !== 1) throw new Error("Usage: upsert-dev-marketplace.mjs <plugin-path> [--marketplace-path file]");
    return upsertDevMarketplace({ pluginPath: positionals[0], marketplacePath: values["marketplace-path"], displayName: values["display-name"], nameZh: values["name-zh"], descriptionZh: values["description-zh"] });
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
