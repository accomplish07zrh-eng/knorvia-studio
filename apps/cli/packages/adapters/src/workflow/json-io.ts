// SPDX-License-Identifier: Apache-2.0
// 工作流文件 IO：JSON/JSONL 读取与「追加或原子替换」两种写入。
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isNodeError, throwIfAborted } from "./path-rules.js";

export type WriteMode = "append" | "replace";

async function ensureParent(target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
}

/** 读文本：ENOENT 归一成 null，其余错误继续上抛（取消文案由调用方给出）。 */
async function readText(
  target: string,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<string | null> {
  throwIfAborted(signal, cancelled);
  try {
    return await readFile(target, "utf8");
  } catch (cause) {
    if (isNodeError(cause) && cause.code === "ENOENT") return null;
    throw cause;
  }
}

export async function readJson(
  target: string,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<unknown | null> {
  const content = await readText(target, signal, cancelled);
  return content === null ? null : JSON.parse(content);
}

/** JSONL：丢掉空行后逐行解析，行内不合法会直接抛错。 */
export async function readJsonLines(
  target: string,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<unknown[]> {
  const content = await readText(target, signal, cancelled);
  if (content === null) return [];
  const rows = content.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  return rows.map((line) => JSON.parse(line));
}

/**
 * 统一写入口：
 * - `append` 用于 JSONL 事件流，不做原子替换；
 * - `replace` 先写临时文件再 rename，读方永远看不到半截文件。
 */
export async function writeText(
  target: string,
  content: string,
  signal: AbortSignal | undefined,
  cancelled: string,
  mode: WriteMode,
): Promise<void> {
  throwIfAborted(signal, cancelled);
  await ensureParent(target);
  if (mode === "append") {
    await appendFile(target, content, "utf8");
    return;
  }
  const staging = `${target}.${randomUUID()}.tmp`;
  await writeFile(staging, content, "utf8");
  await rename(staging, target);
}

export async function appendJsonLine(
  target: string,
  value: unknown,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<void> {
  await writeText(target, `${JSON.stringify(value)}\n`, signal, cancelled, "append");
}

/** 结构化 JSON：两空格缩进 + 末尾换行，落盘走原子替换。 */
export async function writeJson(
  target: string,
  value: unknown,
  signal: AbortSignal | undefined,
  cancelled: string,
): Promise<void> {
  await writeText(target, `${JSON.stringify(value, null, 2)}\n`, signal, cancelled, "replace");
}
