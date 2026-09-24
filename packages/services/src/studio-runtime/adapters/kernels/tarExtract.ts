import { createReadStream } from "node:fs";
import { chmod, mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { createGunzip } from "node:zlib";
import { safeManagedPath } from "./managedPaths.js";

export async function extractOfficialPackage(
  archive: string,
  destination: string,
  signal: AbortSignal,
): Promise<void> {
  const input = createReadStream(archive);
  const gunzip = createGunzip();
  input.on("error", (error) => gunzip.destroy(error));
  input.pipe(gunzip);
  const abort = () => {
    input.destroy();
    gunzip.destroy(new Error("解压已取消"));
  };
  signal.addEventListener("abort", abort, { once: true });
  let buffer = Buffer.alloc(0);
  let remaining = 0;
  let padding = 0;
  let bytes = 0;
  let complete = false;
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    for await (const chunk of gunzip) {
      signal.throwIfAborted();
      buffer = Buffer.concat([buffer, chunk]);
      bytes += chunk.length;
      if (bytes > 1200 * 1024 * 1024) throw new Error("解压内容超过限制");
      while (buffer.length) {
        if (complete) {
          buffer = Buffer.alloc(0);
          break;
        }
        if (remaining) {
          const count = Math.min(buffer.length, remaining);
          await file?.writeFile(buffer.subarray(0, count));
          remaining -= count;
          buffer = buffer.subarray(count);
          if (remaining) break;
          await file?.close();
          file = undefined;
        }
        if (padding) {
          const count = Math.min(padding, buffer.length);
          padding -= count;
          buffer = buffer.subarray(count);
          if (padding) break;
        }
        if (buffer.length < 512) break;
        const header = buffer.subarray(0, 512);
        buffer = buffer.subarray(512);
        if (header.every((value) => value === 0)) {
          complete = true;
          break;
        }
        const decode = (start: number, end: number) =>
          header.subarray(start, end).toString("utf8").split("\0", 1)[0]!.trim();
        const name = decode(0, 100);
        const prefix = decode(345, 500);
        const entry = prefix ? `${prefix}/${name}` : name;
        const size = Number.parseInt(decode(124, 136) || "0", 8);
        const kind = decode(156, 157);
        const stored = Number.parseInt(decode(148, 156), 8);
        let sum = 0;
        for (let index = 0; index < 512; index++)
          sum += index >= 148 && index < 156 ? 32 : header[index]!;
        if (sum !== stored || !Number.isSafeInteger(size) || size < 0)
          throw new Error("无效 TAR 文件头");
        if (!["", "0", "5"].includes(kind)) throw new Error("安装包含不允许的链接或扩展条目");
        if (
          !entry.startsWith("package/") ||
          entry.includes("\\") ||
          entry.split("/").some((piece) => piece === ".." || piece.includes(":"))
        )
          throw new Error("安装包含越界路径");
        const path = await safeManagedPath(destination, entry);
        if (kind === "5") {
          if (size) throw new Error("目录条目不应包含数据");
          await mkdir(path, { recursive: true });
          continue;
        }
        await mkdir(dirname(path), { recursive: true });
        file = await open(path, "wx");
        remaining = size;
        padding = (512 - (size % 512)) % 512;
        await chmod(path, Number.parseInt(decode(100, 108) || "644", 8) & 0o777);
        if (!size) {
          await file.close();
          file = undefined;
        }
      }
    }
    if (!complete || remaining) throw new Error("TAR 安装包不完整");
  } finally {
    signal.removeEventListener("abort", abort);
    await file?.close();
    input.destroy();
    gunzip.destroy();
  }
}
