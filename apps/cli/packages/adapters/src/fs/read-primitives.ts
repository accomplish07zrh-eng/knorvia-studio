// SPDX-License-Identifier: Apache-2.0
// 读原语：前缀读取与有界读取，统一经 withHandle 管理句柄生命周期。
//
// 设计取舍：
// - 句柄生命周期只有 withHandle 一个出口，读逻辑（readAt / readCapped）只接收已打开的句柄；
// - 前缀读取用精确分配（alloc），有界读取用 allocUnsafe 复用首块，避免短文件上的多余清零；
// - 读到 capacity 即停，`bytesRead === 0` 视为文件提前结束。
import { open } from "node:fs/promises";

const CHUNK_SIZE = 64 * 1024;

type Handle = Awaited<ReturnType<typeof open>>;

async function withHandle<T>(path: string, consume: (reader: Handle) => Promise<T>): Promise<T> {
  const reader = await open(path, "r");
  // `.finally` 会等待 close 完成，因此这里不需要显式 try/finally。
  return await consume(reader).finally(() => reader.close());
}

/** 在固定偏移读取至多 length 字节，返回实际读到的部分。 */
async function readAt(reader: Handle, length: number, position: number): Promise<Buffer> {
  const buffer = Buffer.alloc(Math.max(0, length));
  const { bytesRead } = await reader.read(buffer, 0, buffer.length, position);
  return buffer.subarray(0, bytesRead);
}

/** 读取文件开头至多 capacity 字节；文件短于 capacity 时返回实际长度。 */
export async function prefix(path: string, capacity: number): Promise<Buffer> {
  return await withHandle(path, (reader) => readAt(reader, capacity, 0));
}

/** 分块读到 capacity 为止：首块按调用方给出的初始大小预分配，后续块用固定块长。 */
async function readCapped(reader: Handle, capacity: number, initialSize: number): Promise<Buffer> {
  const initial = Buffer.allocUnsafe(Math.min(capacity, Math.max(1, initialSize + 1)));
  const slices: Buffer[] = [];
  let consumed = 0;
  while (consumed < capacity) {
    const window =
      consumed === 0 ? initial : Buffer.allocUnsafe(Math.min(CHUNK_SIZE, capacity - consumed));
    const { bytesRead } = await reader.read(window, 0, window.length, consumed);
    if (bytesRead === 0) break;
    slices.push(window.subarray(0, bytesRead));
    consumed += bytesRead;
  }
  if (slices.length === 0) return Buffer.alloc(0);
  if (slices.length === 1) return slices[0]!;
  return Buffer.concat(slices, consumed);
}

/** 有界读取：调用方给出预期初始大小，用于减少大文件上的重复分配。 */
export async function bounded(
  path: string,
  capacity: number,
  initialSize: number,
): Promise<Buffer> {
  return await withHandle(path, (reader) => readCapped(reader, capacity, initialSize));
}
