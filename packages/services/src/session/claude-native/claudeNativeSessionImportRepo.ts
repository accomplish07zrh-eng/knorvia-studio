import { copyFile, mkdir, readdir, rename, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, normalize, resolve, sep } from "node:path";

import type { KnorviaImportableSessionCandidate } from "@knorvia/shared";

import { createServiceLogger } from "#src/logger/serviceLogger.js";
import { getAppConfigDir, getDataBaseDir, getWorkspaceHash } from "#src/paths.js";
import {
  extractClaudeNativeSessionHeadInfo,
  hasClaudeNativeSidechainMarker,
} from "#src/session/claude-native/claudeNativeSessionHeadParser.js";
import { readJsonLinesFileHead } from "#src/session/claude-native/sessionHistoryJsonl.js";

const logger = createServiceLogger("claude-native-import");

function workspaceComparisonKey(workspacePath: string): string {
  const normalized = normalize(resolve(workspacePath));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isNativeWorktree(workspacePath: string): boolean {
  const segments = normalize(resolve(workspacePath))
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.toLowerCase());
  return segments.some(
    (segment, index) =>
      segment === ".claude" &&
      (segments[index + 1] === "worktree" || segments[index + 1] === "worktrees"),
  );
}

function excludesDirectory(directoryName: string): boolean {
  const name = directoryName.toLowerCase();
  return name === "subagents" || name === "worktree" || name === "worktrees";
}

function nativeProjectRoots(): string[] {
  const homes = new Set<string>([homedir()]);
  const environmentHome = process.env.HOME?.trim();
  if (environmentHome) homes.add(environmentHome);
  const dataHome = getDataBaseDir();
  if (dataHome) homes.add(dataHome);
  return Array.from(homes, (home) => join(home, ".claude", "projects"));
}

class ClaudeNativeSessionImportRepo {
  private async findSessionFile(root: string, sessionId: string): Promise<string | null> {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = join(root, entry.name);
        if (entry.isDirectory()) {
          if (!excludesDirectory(entry.name)) {
            const match = await this.findSessionFile(entryPath, sessionId);
            if (match) return match;
          }
          continue;
        }
        if (entry.isFile() && entry.name === sessionId + ".jsonl") return entryPath;
      }
    } catch {
      return null;
    }
    return null;
  }

  private async collectJsonlFiles(root: string): Promise<string[]> {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const entryPath = join(root, entry.name);
        if (entry.isDirectory()) {
          if (!excludesDirectory(entry.name)) {
            files.push(...(await this.collectJsonlFiles(entryPath)));
          }
          continue;
        }
        if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(entryPath);
      }
      return files;
    } catch {
      return [];
    }
  }

  async scanImportableSessions(params: {
    workspacePath?: string;
    modifiedSince?: number;
    limit?: number;
  }): Promise<KnorviaImportableSessionCandidate[]> {
    const workspaceKey = params.workspacePath ? workspaceComparisonKey(params.workspacePath) : null;
    const collected = await Promise.all(
      nativeProjectRoots().map((root) => this.collectJsonlFiles(root)),
    );
    const paths = [...new Set(collected.flat())];
    const candidates: KnorviaImportableSessionCandidate[] = [];
    for (const filePath of paths) {
      let fileStat: { mtimeMs: number };
      try {
        fileStat = await stat(filePath);
      } catch {
        continue;
      }
      const updatedAt = Math.trunc(fileStat.mtimeMs);
      if (params.modifiedSince && updatedAt < params.modifiedSince) continue;
      try {
        const entries = await readJsonLinesFileHead(filePath, 16);
        if (hasClaudeNativeSidechainMarker(entries)) continue;
        const head = extractClaudeNativeSessionHeadInfo(entries);
        if (!head.workspacePath) continue;
        if (isNativeWorktree(head.workspacePath)) continue;
        if (workspaceKey && workspaceComparisonKey(head.workspacePath) !== workspaceKey) continue;
        candidates.push({
          provider: "claude",
          sessionId: basename(filePath, ".jsonl"),
          workspacePath: head.workspacePath,
          sourcePath: filePath,
          updatedAt,
          ...(head.createdAt ? { createdAt: head.createdAt } : {}),
          ...(head.previewTitle ? { previewTitle: head.previewTitle } : {}),
        });
      } catch (error) {
        logger.warn(undefined, "扫描 Claude 原生 session 失败 path=" + filePath, error);
      }
    }
    candidates.sort((first, second) => second.updatedAt - first.updatedAt);
    const limited =
      typeof params.limit === "number" && params.limit > 0
        ? candidates.slice(0, params.limit)
        : candidates;
    logger.info(
      undefined,
      "Claude 原生 session 扫描完成 workspaceFilter=" +
        (params.workspacePath ?? "all") +
        " fileCount=" +
        paths.length +
        " candidateCount=" +
        limited.length,
    );
    return limited;
  }

  async findImportableSession(params: {
    workspacePath?: string;
    sessionId: string;
  }): Promise<KnorviaImportableSessionCandidate | null> {
    const workspaceKey = params.workspacePath ? workspaceComparisonKey(params.workspacePath) : null;
    const roots = nativeProjectRoots();
    for (const root of roots) {
      const filePath = await this.findSessionFile(root, params.sessionId);
      if (!filePath) continue;
      try {
        const fileStat = await stat(filePath);
        const entries = await readJsonLinesFileHead(filePath, 16);
        if (hasClaudeNativeSidechainMarker(entries)) return null;
        const head = extractClaudeNativeSessionHeadInfo(entries);
        if (!head.workspacePath) continue;
        if (isNativeWorktree(head.workspacePath)) return null;
        if (workspaceKey && workspaceComparisonKey(head.workspacePath) !== workspaceKey) continue;
        return {
          provider: "claude",
          sessionId: params.sessionId,
          workspacePath: head.workspacePath,
          sourcePath: filePath,
          updatedAt: Math.trunc(fileStat.mtimeMs),
          ...(head.createdAt ? { createdAt: head.createdAt } : {}),
          ...(head.previewTitle ? { previewTitle: head.previewTitle } : {}),
        };
      } catch (error) {
        logger.warn(
          undefined,
          "查找 Claude 原生 session 失败 sessionId=" + params.sessionId,
          error,
        );
      }
    }
    return null;
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async copySessionFileToWorkspace(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    sourcePath: string;
  }): Promise<{ outputPath: string; createdOutputPaths: string[] }> {
    const marker = sep + "projects" + sep;
    const markerPosition = params.sourcePath.lastIndexOf(marker);
    if (markerPosition < 0) {
      throw new Error("[claude-native] Claude 原生 session 路径非法: " + params.sourcePath);
    }
    const relativeSource = params.sourcePath.slice(markerPosition + marker.length);
    const outputPath = join(
      getAppConfigDir(),
      "agent-config",
      "claude",
      getWorkspaceHash(params.workspacePath, params.workspaceIdentity),
      "projects",
      relativeSource,
    );
    const outputDir = dirname(outputPath);
    const existedBefore = await this.pathExists(outputPath);
    const tempPath =
      outputPath +
      "." +
      process.pid +
      "." +
      Date.now().toString(36) +
      "." +
      Math.random().toString(36).slice(2, 8) +
      ".tmp";
    await mkdir(outputDir, { recursive: true });
    await copyFile(params.sourcePath, tempPath);
    await rename(tempPath, outputPath);
    return { outputPath, createdOutputPaths: existedBefore ? [] : [outputPath] };
  }
}

export const claudeNativeSessionImportRepo = new ClaudeNativeSessionImportRepo();
