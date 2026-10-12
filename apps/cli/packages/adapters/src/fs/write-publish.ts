// SPDX-License-Identifier: Apache-2.0
// 写发布：临时文件 + rename 的原子写，拒绝穿透符号链接，失败时降级为原地截断。
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { code } from "./node-file-policy.js";

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

/** 目标已存在时沿用其权限位；符号链接一律拒绝写入。 */
async function modeOfExisting(path: string): Promise<number | undefined> {
  const existing = await lstat(path).catch((error: unknown) => {
    if (code(error) === "ENOENT") return undefined;
    throw error;
  });
  if (existing === undefined) return undefined;
  if (existing.isSymbolicLink()) throw refuseSymlink(path, `. ${SYMLINK_HINT}`);
  return existing.mode;
}

function stagingName(path: string): string {
  return `${path}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
}

/** 写一次文件：O_NOFOLLOW 的 ELOOP 归一到符号链接错误，spec 决定是否 rename。 */
async function writeOnce(destination: string, plan: WriteSpec): Promise<void> {
  const writer: Handle = await open(destination, plan.flags).catch((error: unknown) => {
    if (code(error) === "ELOOP") throw refuseSymlink(destination, " (O_NOFOLLOW)");
    throw error;
  });
  try {
    await writer.writeFile(plan.bytes);
    if (plan.mode !== undefined) await writer.chmod(plan.mode);
    await writer.sync();
  } finally {
    await writer.close();
  }
  if (plan.renameTo !== undefined) await rename(destination, plan.renameTo);
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
