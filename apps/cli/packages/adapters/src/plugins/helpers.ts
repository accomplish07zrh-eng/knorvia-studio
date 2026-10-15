// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return candidate !== null && typeof candidate === "object" && !Array.isArray(candidate);
}

export function resolveInside(baseDir: string, supplied: string): string | null {
  if (isAbsolute(supplied)) return null;
  const target = resolve(baseDir, supplied);
  const escape = relative(baseDir, target);
  return escape.startsWith("..") || isAbsolute(escape) ? null : target;
}

export function sanitizePluginId(identifier: string): string {
  return identifier.replace(/[^a-zA-Z0-9_.@-]/g, "-");
}

export function parsePathList(raw: unknown): string[] {
  if (typeof raw === "string") return [raw];
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}

export function isPluginOptionValue(candidate: unknown): candidate is string | number | boolean {
  return (
    typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean"
  );
}

/** stat 的薄包装：路径不存在或不可读时返回 undefined，调用方按缺失处理。 */
function tryStat(target: string) {
  try {
    return statSync(target);
  } catch {
    return undefined;
  }
}

export function directoryExists(candidate: string): boolean {
  return tryStat(candidate)?.isDirectory() ?? false;
}

export function fileExists(candidate: string): boolean {
  return tryStat(candidate)?.isFile() ?? false;
}

export function isMissingPath(target: string): boolean {
  try {
    statSync(target);
    return /* 已存在就不算缺失 */ false;
  } catch (failure) {
    return isRecord(failure) && (failure.code === "ENOENT" || failure.code === "ENOTDIR");
  }
}

export function isNotFoundError(subject: unknown): boolean {
  return isRecord(subject) && subject.code === "ENOENT";
}

export async function /* 尽力执行插件源清理：按延迟重试，返回最后一次失败 */ cleanupPluginSourceBestEffort(
  dispose: /* 解包时登记的清理回调 */ (() => Promise<void>) | undefined,
  attemptDelaysMs: /* 各次尝试之间的等待表 */ readonly number[] = [0, 25, 100],
): /* 最后一次失败原因；全部成功为 undefined */ Promise<unknown> {
  if (!dispose) return undefined;
  let lastFailure: unknown;
  for (const waitMs of attemptDelaysMs) {
    if (waitMs > 0) await new Promise<void>((done) => setTimeout(done, waitMs));
    try {
      await dispose();
      return undefined;
    } catch (failure) {
      lastFailure = failure;
    }
  }
  return lastFailure;
}

export function appendPluginSourceCleanupError(primary: unknown, secondary: unknown): unknown {
  if (primary instanceof Error && secondary !== undefined) {
    const detail = secondary instanceof Error ? secondary.message : String(secondary);
    primary.message += `; plugin source cleanup also failed: ${detail}`;
  }
  return primary;
}

export function throwIfAborted(settings: { signal?: AbortSignal } | undefined): void {
  if (settings?.signal?.aborted) throw new Error("Plugin operation cancelled");
}
