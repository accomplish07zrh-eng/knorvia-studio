// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：文件状态读取与内容哈希。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{interface,known-differences}.md §三、K3
//
// **K3 是本包唯一「必须与旧实现逐字节一致」的地方**：
//   旧实现（core/src/runtime/methods/file-rewind-storage.ts）：
//     content === null ? "missing" : createHash("sha256").update(content).digest("hex")
//
// 三条边界必须逐字节一致（验收会逐条断言）：
//   · null     → 字面量 "missing"（不是 sha256("")、不是空串）
//   · ""       → sha256("")  = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
//   · "abc"    → sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
//
// **为什么 null 与 "" 必须严格区分**：若把 null 也送去 hash，会得到 sha256("")，
// 于是「文件已删除」的检查点比对永远不等 → 所有删除场景的回退都会失败。
//
// **关于 node:crypto 的合规性**：apps/cli/AGENTS.md 的禁止清单是
// fetch / http / fs / child_process / process.env，**不含 crypto**；
// 且 crypto 只做内存计算、不参与外部 I/O → 所以直接用 createHash 合规（K3.1）。

import { createHash } from "node:crypto";
import { isFileSystemPortError, type FileSystemPort } from "@knorvia/contracts";

/** 不存在的内容哈希哨兵。**必须与旧实现字面量一致**（K3）。 */
export const ABSENT_HASH = "missing";

/** 读取文本时的编码。显式指定，不依赖端口默认值（K3.1）。 */
const TEXT_ENCODING = "utf-8" as const;

/** 一个文件在某一时刻的状态。补偿与漂移检测的最小单位。 */
export interface FileState {
  /** 文件内容；`null` 表示「不存在」。 */
  readonly content: string | null;
  readonly exists: boolean;
  /** `contentHash(content)` 的结果。 */
  readonly hash: string;
}

/**
 * 内容哈希。**必须与旧实现逐字节一致**（K3）。
 *
 * @param content 文件内容；`null` 表示文件不存在
 */
export function contentHash(content: string | null): string {
  if (content === null) return ABSENT_HASH;
  return createHash("sha256").update(content).digest("hex");
}

/** 由内容构造 `FileState`。 */
export function fileStateOf(content: string | null): FileState {
  return Object.freeze({ content, exists: content !== null, hash: contentHash(content) });
}

/** 读取失败的原因。区分「不存在」与「读失败」——后者不能当成「不存在」。 */
export type FileReadFailure = {
  readonly reason: "file_read_failed";
  readonly message: string;
};

/** `readFileState` 的结果：要么拿到状态，要么明确失败。 */
export type FileStateReadResult =
  | { readonly ok: true; readonly state: FileState }
  | { readonly ok: false; readonly failure: FileReadFailure };

/**
 * 读一个文件的当前状态。
 *
 * 语义（B2/B6）：
 * - 文件不存在（`stat` 返回 `kind: "missing"`）→ `content: null` / `exists: false`；
 * - 读取成功 → `content` 是文本，`hash` 是 `contentHash(content)`；
 * - 读取失败（权限、IO 错误等）→ 返回 `ok: false`，**不伪装成「不存在」**。
 *
 * **⚠️ 编码显式传 UTF-8**：`FileSystemPort.readTextFile` 的 `content` 已把换行统一成 LF，
 * 所以 hash 是对「LF 归一化后的文本」计算的 —— 这与旧实现用 `readFileSync(utf8)` 再 hash
 * 的结果在 LF 文件上一致；若旧文件是 CRLF，旧实现 hash 的是含 CRLF 的原文。
 * **这一点在 acceptance.md §6.2 的样本断言里必须验证**（见该节说明）。
 */
export async function readFileState(
  fileSystem: FileSystemPort,
  path: string,
): Promise<FileStateReadResult> {
  try {
    const stat = await fileSystem.stat({ path });
    // `kind: "missing"` 是「不存在」的正常表示，不是错误。
    if (stat.kind === "missing") return { ok: true, state: fileStateOf(null) };
    const read = await fileSystem.readTextFile({ path, encoding: TEXT_ENCODING });
    return { ok: true, state: fileStateOf(read.content) };
  } catch (error) {
    // 端口错误 → 明确失败（B9）：不把「读不到」当成「不存在」。
    return {
      ok: false,
      failure: {
        reason: "file_read_failed",
        message: describeError(error),
      },
    };
  }
}

/** 把任意错误转成可读消息。端口错误用其自身消息，其他错误退回 `String(error)`。 */
export function describeError(error: unknown): string {
  if (isFileSystemPortError(error)) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/**
 * 判断一个错误是否「文件不存在」类。
 *
 * 端口用稳定的错误码表达（`FileSystemErrorCode` 的 `"not_found"`），
 * 不解析 message 文本 —— 与 ports 的「判别请用 isFileSystemPortError」约定一致。
 */
export function isMissingError(error: unknown): boolean {
  return isFileSystemPortError(error) && error.code === "not_found";
}
