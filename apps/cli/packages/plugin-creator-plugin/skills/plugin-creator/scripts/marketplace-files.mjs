import { lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

// 检查整条父路径，避免只检查最终文件而漏过目录链接。
export async function rejectSymlink(path) {
  let cursor = resolve(path);
  for (;;) {
    try {
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${cursor}`);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

export function containedPath(root, value) {
  if (typeof value !== "string" || !value.trim() || isAbsolute(value)) throw new Error("Component paths must be relative");
  const target = resolve(root, value);
  const delta = relative(root, target);
  if (!delta || delta === ".." || delta.startsWith(`..${sep}`) || isAbsolute(delta))
    throw new Error("Component path escapes the plugin directory");
  return target;
}

export async function atomicJson(path, value) {
  await rejectSymlink(path);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

export async function withMarketplaceLock(path, operation) {
  await rejectSymlink(path);
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Local source is locked by another writer; retry after it finishes");
    throw error;
  }
  try { return await operation(); }
  finally { await lock.close(); await rm(lockPath); }
}

export async function marketplacePlan(path, pluginRoot, name, force = false, requireSameSource = false) {
  await rejectSymlink(path);
  await rejectSymlink(pluginRoot);
  let market;
  if (await exists(path)) {
    market = JSON.parse(await readFile(path, "utf8"));
    if (!market || typeof market.name !== "string" || !Array.isArray(market.plugins))
      throw new Error("Invalid local source index; refusing to overwrite it");
  } else {
    const suffix = createHash("sha256").update(resolve(path)).digest("hex").slice(0, 12);
    market = { name: `knorvia-local-${suffix}`, owner: { name: "Knorvia Studio" }, plugins: [] };
  }
  const duplicate = market.plugins.filter((entry) => entry.name === name);
  if (duplicate.length > 1) throw new Error("Duplicate plugin entries in local source");
  const previous = duplicate[0];
  if (previous && !force) throw new Error("Plugin already exists in local source; use explicit update");
  if (previous && requireSameSource && (typeof previous.source !== "string" || resolve(dirname(path), previous.source) !== resolve(pluginRoot)))
    throw new Error("Existing plugin points to a different source directory");
  const source = relative(dirname(path), resolve(pluginRoot)).split(sep).join("/");
  if (!source || source === ".." || source.startsWith("../")) throw new Error("Plugin must be inside the local source directory");
  const entry = { ...previous, name, source: `./${source}` };
  market.plugins = previous ? market.plugins.map((item) => item === previous ? entry : item) : [...market.plugins, entry];
  return market;
}
