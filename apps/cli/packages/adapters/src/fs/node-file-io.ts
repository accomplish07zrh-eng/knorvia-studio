// SPDX-License-Identifier: Apache-2.0
// 文件读写原语：前缀读取、有界读取、以及「拒绝穿透符号链接」的原子发布。
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { code } from "./node-file-policy.js";

const CHUNK_SIZE = 64 * 1024;
const NONFOLLOW_CREATE = constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW;
const SYMLINK_HINT = "Resolve the symlink and pass the real target path explicitly.";

class SymlinkWriteRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SymlinkWriteRefusedError";
  }
}

function symlinkRefused(path: string, suffix = ""): SymlinkWriteRefusedError {
  return new SymlinkWriteRefusedError(`Refusing to write through symlink: ${path}${suffix}`);
}

/** 读取文件开头至多 capacity 字节；文件短于 capacity 时返回实际长度。 */
export async function prefix(path: string, capacity: number): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(Math.max(0, capacity));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** 分块读到 capacity 为止：首块按调用方给出的初始大小预分配，后续块用固定块长。 */
async function readUpTo(
  handle: Awaited<ReturnType<typeof open>>,
  capacity: number,
  initialSize: number,
): Promise<Buffer> {
  const first = Buffer.allocUnsafe(Math.min(capacity, Math.max(1, initialSize + 1)));
  const blocks: Buffer[] = [];
  let filled = 0;
  while (filled < capacity) {
    const block =
      filled === 0 ? first : Buffer.allocUnsafe(Math.min(CHUNK_SIZE, capacity - filled));
    const { bytesRead } = await handle.read(block, 0, block.length, filled);
    if (bytesRead === 0) break;
    blocks.push(block.subarray(0, bytesRead));
    filled += bytesRead;
  }
  if (blocks.length === 0) return Buffer.alloc(0);
  if (blocks.length === 1) return blocks[0]!;
  return Buffer.concat(blocks, filled);
}

export async function bounded(
  path: string,
  capacity: number,
  initialSize: number,
): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    return await readUpTo(handle, capacity, initialSize);
  } finally {
    await handle.close();
  }
}

/** 目标已存在时沿用其权限位；符号链接一律拒绝写入。 */
async function existingMode(path: string): Promise<number | undefined> {
  const current = await lstat(path).catch((error: unknown) => {
    if (code(error) === "ENOENT") return undefined;
    throw error;
  });
  if (current === undefined) return undefined;
  if (current.isSymbolicLink()) throw symlinkRefused(path, `. ${SYMLINK_HINT}`);
  return current.mode;
}

/** 临时文件写入 → fsync → rename；任何失败都清理临时文件并交给调用方降级。 */
async function writeTemporary(
  path: string,
  bytes: Buffer,
  mode: number | undefined,
): Promise<void> {
  const temporary = `${path}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  try {
    const file = await open(temporary, NONFOLLOW_CREATE | constants.O_EXCL);
    try {
      await file.writeFile(bytes);
      if (mode !== undefined) await file.chmod(mode);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

/** 降级路径：直接截断写入；O_NOFOLLOW 触发 ELOOP 时按「符号链接」归类。 */
async function writeInPlace(path: string, bytes: Buffer): Promise<void> {
  const file = await open(path, NONFOLLOW_CREATE | constants.O_TRUNC).catch((error: unknown) => {
    if (code(error) === "ELOOP") throw symlinkRefused(path, " (O_NOFOLLOW)");
    throw error;
  });
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
}

export async function publish(path: string, bytes: Buffer): Promise<void> {
  const mode = await existingMode(path);
  try {
    await writeTemporary(path, bytes, mode);
  } catch {
    await writeInPlace(path, bytes);
  }
}
