import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { COMPONENTS, normalizePluginName, scaffoldFiles } from "./scaffold-files.mjs";
import { atomicJson, containedPath, exists, marketplacePlan, rejectSymlink, withMarketplaceLock } from "./marketplace-files.mjs";

export { normalizePluginName } from "./scaffold-files.mjs";

export async function createPlugin({ name: input, parentPath = resolve("plugins"), marketplacePath, components = [], force = false }) {
  const name = normalizePluginName(input);
  const root = resolve(parentPath, name);
  const files = scaffoldFiles(name, components);
  const marketPath = marketplacePath ? resolve(marketplacePath) : undefined;
  await rejectSymlink(root);
  if (marketPath) await marketplacePlan(marketPath, root, name, force, true);
  return withMarketplaceLock(join(resolve(parentPath), `.${name}.create`), async () => {
    if (!force && await exists(root)) throw new Error("Plugin directory already exists");
    const previous = new Map();
    for (const file of files.keys()) {
      const path = containedPath(root, file);
      await rejectSymlink(path);
      previous.set(path, await exists(path) ? await readFile(path) : null);
    }
    const perform = async () => {
      // 在持有来源索引锁后复查冲突，避免把过期的预检结果当成写入许可。
      const market = marketPath ? await marketplacePlan(marketPath, root, name, force, true) : undefined;
      const written = [];
      try {
        for (const [file, content] of files) {
          const path = containedPath(root, file);
          await rejectSymlink(path);
          await mkdir(dirname(path), { recursive: true });
          const handle = await open(path, force ? "w" : "wx");
          // 只有成功取得文件句柄后才拥有回滚资格，EEXIST 不能删除别人的文件。
          written.push(path);
          try { await handle.writeFile(content); }
          finally { await handle.close(); }
        }
        if (marketPath) await atomicJson(marketPath, market);
        return root;
      } catch (error) {
        const failures = [];
        for (const path of written.reverse()) {
          try {
            await rejectSymlink(path);
            const content = previous.get(path);
            if (content === null) await rm(path, { force: true });
            else await writeFile(path, content);
          } catch (rollbackError) { failures.push(rollbackError); }
        }
        if (failures.length) throw new AggregateError([error, ...failures], "Creation failed and some files could not be rolled back");
        throw error;
      }
    };
    return marketPath ? withMarketplaceLock(marketPath, perform) : perform();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      path: { type: "string" }, "marketplace-path": { type: "string" }, force: { type: "boolean", default: false },
      ...Object.fromEntries(COMPONENTS.map((name) => [`with-${name}`, { type: "boolean", default: false }])),
    },
  });
  Promise.resolve().then(() => {
    if (positionals.length !== 1) throw new Error("Usage: create-basic-plugin.mjs <name> [--path parent] [--with-skills] [--force]");
    return createPlugin({ name: positionals[0], parentPath: values.path, marketplacePath: values["marketplace-path"], force: values.force, components: COMPONENTS.filter((name) => values[`with-${name}`]) });
  }).then((root) => console.log(root)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
