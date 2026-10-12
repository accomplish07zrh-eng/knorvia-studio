// SPDX-License-Identifier: Apache-2.0
// 读原语：前缀读取与有界读取，统一经 withHandle 管理句柄生命周期。
import { open } from "node:fs/promises";

const CHUNK_SIZE = 64 * 1024;

type Handle = Awaited<ReturnType<typeof open>>;

/** 统一的「打开 → 使用 → 关闭」：读取入口都经这里，避免散落的 close。 */
async function withHandle<T>(path: string, consume: (reader: Handle) => Promise<T>): Promise<T> {
  const reader = await open(path, "r");
  // `.finally` 会等待 close 完成，因此这里不需要显式 try/finally。
  return await consume(reader).finally(() => reader.close());
}

/** 读取文件开头至多 capacity 字节；文件短于 capacity 时返回实际长度。 */
export async function prefix(path: string, capacity: number): Promise<Buffer> {
  return await withHandle(path, async (reader) => {
    const buffer = Buffer.alloc(Math.max(0, capacity));
    const { bytesRead } = await reader.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
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
  return await withHandle(path, (reader) => readCapped(reader, capacity, initialSize));
}
