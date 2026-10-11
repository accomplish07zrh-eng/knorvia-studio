// SPDX-License-Identifier: Apache-2.0
// 文件读写原语：前缀读取、有界读取、以及「拒绝穿透符号链接」的原子发布。
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { code } from "./node-file-policy.js";

const CHUNK_SIZE = 64 * 1024;
const NONFOLLOW_CREATE = constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW;
const SYMLINK_HINT = "Resolve the symlink and pass the real target path explicitly.";
const STAGING_FLAGS = NONFOLLOW_CREATE | constants.O_EXCL;
const IN_PLACE_FLAGS = NONFOLLOW_CREATE | constants.O_TRUNC;

type Handle = Awaited<ReturnType<typeof open>>;

/** 写一次文件的完整描述：打开方式、是否恢复权限位、写完是否 rename 到目标。 */
interface WriteSpec {
  bytes: Buffer;
  flags: number;
  mode: number | undefined;
  renameTo: string | undefined;
}

class SymlinkWriteRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SymlinkWriteRefusedError";
  }
}

function refuseSymlink(path: string, suffix = ""): SymlinkWriteRefusedError {
  return new SymlinkWriteRefusedError(`Refusing to write through symlink: ${path}${suffix}`);
}

/** 统一的「打开 → 使用 → 关闭」：读取入口都经这里，避免散落的 close。 */
async function withHandle<T>(path: string, use: (handle: Handle) => Promise<T>): Promise<T> {
  const handle = await open(path, "r");
  // .finally 会等待 close 完成，因此这里不需要显式 try/finally。
  return await use(handle).finally(() => handle.close());
}

/** 读取文件开头至多 capacity 字节；文件短于 capacity 时返回实际长度。 */
export async function prefix(path: string, capacity: number): Promise<Buffer> {
  return await withHandle(path, async (handle) => {
    const target = Buffer.alloc(Math.max(0, capacity));
    const { bytesRead } = await handle.read(target, 0, target.length, 0);
    return target.subarray(0, bytesRead);
  });
}

/** 分块读到 capacity 为止：首块按调用方给出的初始大小预分配，后续块用固定块长。 */
async function readCapped(handle: Handle, capacity: number, initialSize: number): Promise<Buffer> {
  const head = Buffer.allocUnsafe(Math.min(capacity, Math.max(1, initialSize + 1)));
  const parts: Buffer[] = [];
  let written = 0;
  while (written < capacity) {
    const slice =
      written === 0 ? head : Buffer.allocUnsafe(Math.min(CHUNK_SIZE, capacity - written));
    const { bytesRead } = await handle.read(slice, 0, slice.length, written);
    if (bytesRead === 0) break;
    parts.push(slice.subarray(0, bytesRead));
    written += bytesRead;
  }
  if (parts.length === 0) return Buffer.alloc(0);
  if (parts.length === 1) return parts[0]!;
  return Buffer.concat(parts, written);
}

export async function bounded(
  path: string,
  capacity: number,
  initialSize: number,
): Promise<Buffer> {
  return await withHandle(path, (handle) => readCapped(handle, capacity, initialSize));
}

/** 目标已存在时沿用其权限位；符号链接一律拒绝写入。 */
async function modeOfExisting(path: string): Promise<number | undefined> {
  const current = await lstat(path).catch((error: unknown) => {
    if (code(error) === "ENOENT") return undefined;
    throw error;
  });
  if (current === undefined) return undefined;
  if (current.isSymbolicLink()) throw refuseSymlink(path, `. ${SYMLINK_HINT}`);
  return current.mode;
}

function stagingName(path: string): string {
  return `${path}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
}

/** 写一次文件：O_NOFOLLOW 的 ELOOP 归一到符号链接错误，spec 决定是否 rename。 */
async function writeOnce(target: string, spec: WriteSpec): Promise<void> {
  const io = await open(target, spec.flags).catch((error: unknown) => {
    if (code(error) === "ELOOP") throw refuseSymlink(target, " (O_NOFOLLOW)");
    throw error;
  });
  try {
    await io.writeFile(spec.bytes);
    if (spec.mode !== undefined) await io.chmod(spec.mode);
    await io.sync();
  } finally {
    await io.close();
  }
  if (spec.renameTo !== undefined) await rename(target, spec.renameTo);
}

export async function publish(path: string, bytes: Buffer): Promise<void> {
  const mode = await modeOfExisting(path);
  const staging = stagingName(path);
  try {
    await writeOnce(staging, { bytes, flags: STAGING_FLAGS, mode, renameTo: path });
  } catch {
    // 临时文件路径失败时清掉残留，再退化成直接截断写入。
    await unlink(staging).catch(() => undefined);
    await writeOnce(path, { bytes, flags: IN_PLACE_FLAGS, mode: undefined, renameTo: undefined });
  }
}
