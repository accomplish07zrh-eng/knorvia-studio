import { lstat, mkdir, open, readFile, realpath, rm, writeFile, rename } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { record, text, validVersion, type ExternalKernel } from "../../domain/kernelPolicy.js";

export interface ManagedKernel {
  owner: "knorvia-studio";
  kernel: ExternalKernel;
  version: string;
  directory: string;
  executable: string;
  sha256: string;
}
export function childPath(root: string, path: string): string {
  const result = resolve(root, path);
  const rel = relative(resolve(root), result);
  if (!rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel))
    throw new Error("安装路径越出 Studio 管理目录");
  return result;
}
export async function safeManagedRoot(dataDir: string): Promise<string> {
  if (!isAbsolute(dataDir)) throw new Error("Studio 数据目录必须是绝对路径");
  await mkdir(dataDir, { recursive: true });
  const base = await realpath(dataDir);
  const root = join(base, "kernels");
  await mkdir(root, { recursive: true });
  if ((await lstat(root)).isSymbolicLink() || (await realpath(root)) !== root)
    throw new Error("Studio 内核目录不允许符号链接或重定向");
  return root;
}
export async function safeManagedPath(root: string, path: string): Promise<string> {
  const result = childPath(root, path);
  const segments = relative(root, result).split(sep);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("管理目录不允许符号链接");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return result;
}
export async function readManaged(
  root: string,
  kernel: ExternalKernel,
): Promise<ManagedKernel | undefined> {
  const path = await safeManagedPath(root, `${kernel}.json`);
  let data: Record<string, unknown>;
  try {
    data = record(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  return validateManagedEntry(root, kernel, data);
}
export async function validateManagedEntry(
  root: string,
  kernel: ExternalKernel,
  data: Record<string, unknown>,
): Promise<ManagedKernel> {
  if (
    data.owner !== "knorvia-studio" ||
    data.kernel !== kernel ||
    !text(data.sha256).match(/^[a-f0-9]{64}$/)
  )
    throw new Error("内核副本缺少有效 Studio 所有权记录");
  const directory = text(data.directory);
  const executable = text(data.executable);
  if (
    !directory.startsWith(kernel + "-") ||
    isAbsolute(directory) ||
    directory.includes("/") ||
    directory.includes("\\")
  )
    throw new Error("无效的内核版本目录");
  await safeManagedPath(root, directory);
  const binary = await safeManagedPath(root, executable);
  const expected = childPath(root, directory);
  const rel = relative(expected, binary);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("程序路径不属于已登记版本");
  return {
    owner: "knorvia-studio",
    kernel,
    version: validVersion(data.version),
    directory,
    executable,
    sha256: text(data.sha256),
  };
}
export async function writeManaged(root: string, entry: ManagedKernel): Promise<void> {
  const temporary = await safeManagedPath(root, `.manifest-${randomUUID()}.json`);
  const destination = await safeManagedPath(root, `${entry.kernel}.json`);
  await writeFile(temporary, JSON.stringify(entry), { flag: "wx" });
  try {
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function managedLock(root: string): Promise<() => Promise<void>> {
  const path = await safeManagedPath(root, ".manage.lock");
  try {
    const lock = await open(path, "wx");
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, token: randomUUID() }));
    } catch (error) {
      await lock.close();
      await rm(path, { force: true });
      throw error;
    }
    return async () => {
      await lock.close();
      await rm(path, { force: true });
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      if (await recoverDeadLock(root, path)) return managedLock(root);
      throw new Error("另一个内核管理操作正在执行，请稍后重试");
    }
    throw error;
  }
}

export function processAlive(pid: unknown): boolean {
  if (!Number.isInteger(pid) || Number(pid) <= 0) return true;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
async function recoverDeadLock(root: string, path: string): Promise<boolean> {
  let previous: Record<string, unknown>;
  try {
    previous = record(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
  if (processAlive(previous.pid) || !/^[a-f0-9-]{36}$/.test(text(previous.token))) return false;
  // 每个死锁令牌只有一个恢复者，保留小墓碑，防止另一个窗口误删刚创建的新锁。
  const recovery = await safeManagedPath(root, `.recovered-${text(previous.token)}`);
  try {
    const guard = await open(recovery, "wx");
    await guard.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    const current = record(JSON.parse(await readFile(path, "utf8")));
    if (current.token !== previous.token) return false;
    await rm(path);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}
