// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 临时目录适配器：为需要「一次性的工作目录」的插件提供 mkdtemp / rm 语义。
//
// 为什么放在 adapters 而不是 contracts 的 FileSystemPort：
//   · 「临时目录」是 hooks 插件的专属需求，不是通用文件系统能力
//   · 把它加进 FileSystemPort 会让所有实现（含 device/fs 的封闭契约测试）都要跟着改
//   · 而 AGENTS.md 要求「外部 I/O 收敛到 adapter」→ 这里是 adapter 层，位置正确
//
// 为什么单独一个文件而不是加进 `fs/index.ts`：
//   · `fs/index.ts` 被 `device-fs-contract` 的 esbuild seam 拦截（只允许固定白名单的
//     node:fs / node:os 导入）。这个文件不在 seam 的 entry 列表里，所以可以自由使用
//     `mkdtemp` / `rm` / `tmpdir`，而不会破坏那套封闭契约测试。
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 临时目录端口：插件只依赖这个接口，不直接碰 `node:fs`。
 *
 * 与 `FileSystemPort` 的区别：这里的两个方法**只服务于「一次性的工作目录」**这个场景，
 * 不试图表达通用文件操作。
 */
export interface TempDirectoryPort {
  /** 在系统临时目录（或指定父目录）下创建一个唯一命名目录，返回绝对路径。 */
  createTempDirectory(request: {
    readonly prefix: string;
    readonly parentDirectory?: string;
  }): Promise<{ readonly path: string }>;
  /**
   * 递归删除目录树。
   *
   * `missingOk` 默认 true：调用方的 `cleanup()` 可能被重复调用（如 finally 里再次清理），
   * 第二次删除不存在的目录不能抛错。
   */
  removeDirectory(request: {
    readonly path: string;
    readonly missingOk?: boolean;
  }): Promise<{ readonly removed: boolean }>;
}

/**
 * 用 `node:fs` 实现的临时目录端口。
 *
 * `createTempDirectory` 用系统 `mkdtemp`：唯一性由内核保证，
 * 避免「先 stat 再创建」的 TOCTOU 竞态。
 */
export function createNodeTempDirectoryPort(): TempDirectoryPort {
  return {
    async createTempDirectory(request) {
      const parent = request.parentDirectory ?? tmpdir();
      // mkdtemp 的模板必须以分隔符结尾，否则随机后缀会拼到父目录名后面。
      const template = join(parent, request.prefix);
      const path = await mkdtemp(template);
      return { path };
    },
    async removeDirectory(request) {
      const missingOk = request.missingOk ?? true;
      try {
        await rm(request.path, { recursive: true, force: missingOk });
        return { removed: true };
      } catch (error) {
        // force: true 已覆盖「不存在」；能走到这里的是真实错误（权限、占用等）。
        if (missingOk && isMissingPathError(error)) return { removed: false };
        throw error;
      }
    },
  };
}

/** 判断是否为「路径不存在」类错误（跨平台：ENOENT 与 Windows 的 ENOENT 变体）。 */
function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
