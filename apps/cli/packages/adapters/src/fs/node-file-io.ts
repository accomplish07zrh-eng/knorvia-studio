import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { code } from "./node-file-policy.js";
const CHUNK_SIZE = 64 * 1024;
const NONFOLLOW_CREATE = constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW;
export async function prefix(path: string, capacity: number): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const bytes = Buffer.alloc(Math.max(0, capacity));
    const read = await handle.read(bytes, 0, bytes.length, 0);
    return bytes.subarray(0, read.bytesRead);
  } finally {
    await handle.close();
  }
}
export async function bounded(
  path: string,
  capacity: number,
  initialSize: number,
): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const first = Buffer.allocUnsafe(Math.min(capacity, Math.max(1, initialSize + 1)));
    const chunks: Buffer[] = [];
    let position = 0;
    while (position < capacity) {
      const block =
        position === 0 ? first : Buffer.allocUnsafe(Math.min(CHUNK_SIZE, capacity - position));
      const { bytesRead } = await handle.read(block, 0, block.length, position);
      if (bytesRead === 0) break;
      chunks.push(block.subarray(0, bytesRead));
      position += bytesRead;
    }
    return chunks.length === 0
      ? Buffer.alloc(0)
      : chunks.length === 1
        ? chunks[0]!
        : Buffer.concat(chunks, position);
  } finally {
    await handle.close();
  }
}
class SymlinkWriteRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SymlinkWriteRefusedError";
  }
}
export async function publish(path: string, bytes: Buffer): Promise<void> {
  let mode: number | undefined;
  try {
    const current = await lstat(path);
    if (current.isSymbolicLink())
      throw new SymlinkWriteRefusedError(
        `Refusing to write through symlink: ${path}. Resolve the symlink and pass the real target path explicitly.`,
      );
    mode = current.mode;
  } catch (error) {
    if (code(error) !== "ENOENT") throw error;
  }
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
  } catch {
    await unlink(temporary).catch(() => undefined);
    const file = await open(path, NONFOLLOW_CREATE | constants.O_TRUNC).catch((error: unknown) => {
      if (code(error) === "ELOOP")
        throw new SymlinkWriteRefusedError(
          `Refusing to write through symlink: ${path} (O_NOFOLLOW)`,
        );
      throw error;
    });
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
  }
}
