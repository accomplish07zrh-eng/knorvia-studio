import { lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { record, type ExternalKernel } from "../../domain/kernelPolicy.js";
import { expandShortNames } from "../longPath.js";
import { hashFile } from "./installSource.js";
import { safeManagedPath, validateManagedEntry, type ManagedKernel } from "./managedPaths.js";

const receiptName = ".knorvia-managed.json";
const maximumEntries = 20_000;
interface Inventory {
  files: Record<string, string>;
  directories: string[];
}
interface VersionReceipt extends ManagedKernel, Inventory {
  format: 1;
}
function inside(root: string, path: string): boolean {
  const rel = relative(root, resolve(path));
  return !rel || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}
async function inventory(directory: string, signal?: AbortSignal): Promise<Inventory> {
  const files: Record<string, string> = Object.create(null);
  const directories: string[] = [];
  let count = 0;
  async function walk(parent: string): Promise<void> {
    for (const name of (await readdir(parent)).sort()) {
      signal?.throwIfAborted();
      if (parent === directory && name === receiptName) continue;
      if (++count > maximumEntries) throw new Error("受管内核文件过多，拒绝不完整的所有权验证");
      const path = await safeManagedPath(directory, join(parent, name));
      const detail = await lstat(path);
      const key = relative(directory, path).split(sep).join("/");
      if (detail.isDirectory()) {
        directories.push(key);
        await walk(path);
      } else if (detail.isFile()) {
        files[key] = await hashFile(path);
      } else throw new Error("受管内核目录包含未知类型的文件");
    }
  }
  await walk(directory);
  return { files, directories: directories.sort() };
}
export async function writeVersionReceipt(
  stage: string,
  entry: ManagedKernel,
  signal: AbortSignal,
): Promise<void> {
  const contents = await inventory(stage, signal);
  const executable = relative(entry.directory, entry.executable).split(sep).join("/");
  if (contents.files[executable] !== entry.sha256) throw new Error("安装前完整性校验失败");
  signal.throwIfAborted();
  await writeFile(
    await safeManagedPath(stage, receiptName),
    JSON.stringify({ ...entry, ...contents, format: 1 }),
    { flag: "wx" },
  );
}
async function readReceipt(
  root: string,
  kernel: ExternalKernel,
  directory: string,
): Promise<VersionReceipt | undefined> {
  let data: Record<string, unknown>;
  try {
    data = record(
      JSON.parse(await readFile(await safeManagedPath(root, join(directory, receiptName)), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return;
    throw error;
  }
  if (data.owner !== "knorvia-studio" || data.kernel !== kernel) return;
  const entry = await validateManagedEntry(root, kernel, data);
  if (relative(resolve(root, entry.directory), resolve(root, directory)) || data.format !== 1)
    throw new Error("内核版本收据与目录不一致，请重新安装");
  const files = record(data.files);
  const directories = data.directories;
  if (
    !Array.isArray(directories) ||
    directories.some((name) => typeof name !== "string") ||
    Object.values(files).some((hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) ||
    Object.keys(files).length + directories.length > maximumEntries
  )
    throw new Error("内核版本收据文件清单无效，请重新安装");
  const base = await safeManagedPath(root, directory);
  for (const name of [...Object.keys(files), ...directories] as string[]) {
    const path = await safeManagedPath(base, name);
    if (relative(base, path).split(sep).join("/") !== name)
      throw new Error("内核版本收据包含无效路径");
  }
  const executable = relative(base, await safeManagedPath(root, entry.executable))
    .split(sep)
    .join("/");
  if (files[executable] !== entry.sha256) throw new Error("内核版本收据完整性无效，请重新安装");
  return {
    ...entry,
    format: 1,
    files: files as Record<string, string>,
    directories: directories as string[],
  };
}
async function verifyReceipt(root: string, entry: VersionReceipt): Promise<void> {
  const actual = await inventory(await safeManagedPath(root, entry.directory));
  const expected = Object.entries(entry.files).sort(([a], [b]) => a.localeCompare(b));
  const found = Object.entries(actual.files).sort(([a], [b]) => a.localeCompare(b));
  if (
    JSON.stringify(expected) !== JSON.stringify(found) ||
    JSON.stringify([...entry.directories].sort()) !== JSON.stringify(actual.directories)
  )
    throw new Error("Studio 内核副本完整性已改变或包含未知文件，请重新安装；不会删除这些文件");
}
export async function versionForExecutable(
  root: string,
  kernel: ExternalKernel,
  path: string,
): Promise<ManagedKernel | undefined> {
  if (!isAbsolute(path)) return;
  // root 已是 realpath 长名；用户配置的路径可能写成 8.3 短名，先展开短名（不跟随链接），
  // 否则合法受管内核会被误判为「外部重定向」。
  path = await expandShortNames(path);
  if (!inside(root, path)) {
    let actual: string;
    try {
      actual = await realpath(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (inside(root, actual)) throw new Error("受管内核不允许通过外部路径重定向执行");
    return;
  }
  const executable = await safeManagedPath(root, path);
  const directory = relative(root, executable).split(sep)[0]!;
  const entry = await readReceipt(root, kernel, directory);
  if (!entry) throw new Error("内核副本缺少有效 Studio 版本收据，请重新安装");
  if (relative(executable, await safeManagedPath(root, entry.executable)))
    throw new Error("程序路径不是版本收据登记的内核入口");
  await verifyReceipt(root, entry);
  return entry;
}
export async function removeOwnedVersions(
  root: string,
  kernel: ExternalKernel,
  current?: ManagedKernel,
): Promise<void> {
  const names = await readdir(root);
  if (names.length > maximumEntries) throw new Error("内核目录条目过多，拒绝不完整的卸载扫描");
  const entries: VersionReceipt[] = [];
  for (const name of names) {
    if (!name.startsWith(kernel + "-")) continue;
    const directory = await safeManagedPath(root, name);
    if (!(await lstat(directory)).isDirectory()) continue;
    const entry = await readReceipt(root, kernel, name);
    if (!entry) continue; // 没有有效收据的目录不是已证明的安装产物，不能顺便删除。
    await verifyReceipt(root, entry);
    entries.push(entry);
  }
  if (current && !entries.some((entry) => entry.directory === current.directory))
    throw new Error("当前内核缺少有效 Studio 版本收据，请重新安装；不会删除未知目录");
  if (!entries.length) throw new Error("此内核不是 Studio 管理的副本；不会卸载系统安装");
  // 先验证整批，再移除入口。中途退出留下的带收据版本可再次卸载，不会被误认为系统安装。
  if (current) await rm(await safeManagedPath(root, `${kernel}.json`));
  for (const entry of entries) {
    await verifyReceipt(root, entry);
    await rm(await safeManagedPath(root, entry.directory), { recursive: true });
  }
}
