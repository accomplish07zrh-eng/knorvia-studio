// SPDX-License-Identifier: Apache-2.0
// 写发布：临时文件 + rename 的原子写，拒绝穿透符号链接，失败时降级为原地截断。
//
// 两条写入路径都由 WriteSpec 描述：正常路径写临时文件后 rename（O_EXCL，权限位沿用旧值）；
// 降级路径直接以 O_TRUNC 写目标（不恢复权限位）。O_NOFOLLOW 触发 ELOOP 时统一归类为
// 「拒绝穿透符号链接」，错误文案保持逐字不变。
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

/** 落盘序列：写内容 → 需要时恢复权限位 → fsync 落稳。 */
async function flush(writer: Handle, plan: WriteSpec): Promise<void> {
  await writer.writeFile(plan.bytes);
  if (plan.mode !== undefined) await writer.chmod(plan.mode);
  await writer.sync();
}

/** 写一次文件：O_NOFOLLOW 的 ELOOP 归一到符号链接错误，spec 决定是否 rename。 */
async function writeOnce(destination: string, plan: WriteSpec): Promise<void> {
  const writer: Handle = await open(destination, plan.flags).catch((error: unknown) => {
    if (code(error) === "ELOOP") throw refuseSymlink(destination, " (O_NOFOLLOW)");
    throw error;
  });
  try {
    await flush(writer, plan);
  } finally {
    await writer.close();
  }
  if (plan.renameTo !== undefined) await rename(destination, plan.renameTo);
}

export async function publish(path: string, bytes: Buffer): Promise<void> {
  const mode = await modeOfExisting(path);
  const staging = stagingName(path);
  const staged: WriteSpec = { bytes, flags: STAGING_FLAGS, mode, renameTo: path };
  try {
    await writeOnce(staging, staged);
  } catch {
    // 临时文件路径失败时清掉残留，再退化成直接截断写入。
    await unlink(staging).catch(() => undefined);
    const inPlace: WriteSpec = {
      bytes,
      flags: IN_PLACE_FLAGS,
      mode: undefined,
      renameTo: undefined,
    };
    await writeOnce(path, inPlace);
  }
}
