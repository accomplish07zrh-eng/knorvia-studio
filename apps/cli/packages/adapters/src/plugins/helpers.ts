// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function resolveInside(rootPath: string, rawPath: string): string | null {
  if (isAbsolute(rawPath)) return null;
  const result = resolve(rootPath, rawPath);
  const displacement = relative(rootPath, result);
  return displacement.startsWith("..") || isAbsolute(displacement) ? null : result;
}

export function sanitizePluginId(pluginId: string): string {
  return pluginId.replace(/[^a-zA-Z0-9_.@-]/g, "-");
}

export function parsePathList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function isPluginOptionValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function isMissingPath(path: string): boolean {
  try {
    statSync(path);
    return false;
  } catch (error) {
    return isRecord(error) && (error.code === "ENOENT" || error.code === "ENOTDIR");
  }
}

export function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

export async function cleanupPluginSourceBestEffort(
  cleanup: (() => Promise<void>) | undefined,
  retryDelaysMs: readonly number[] = [0, 25, 100],
): Promise<unknown> {
  if (!cleanup) return undefined;
  let failure: unknown;
  for (const delay of retryDelaysMs) {
    if (delay > 0) await new Promise<void>((done) => setTimeout(done, delay));
    try {
      await cleanup();
      return undefined;
    } catch (error) {
      failure = error;
    }
  }
  return failure;
}

export function appendPluginSourceCleanupError(
  primaryError: unknown,
  cleanupError: unknown,
): unknown {
  if (primaryError instanceof Error && cleanupError !== undefined) {
    const detail = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
    primaryError.message += `; plugin source cleanup also failed: ${detail}`;
  }
  return primaryError;
}

export function throwIfAborted(options: { signal?: AbortSignal } | undefined): void {
  if (options?.signal?.aborted) throw new Error("Plugin operation cancelled");
}
