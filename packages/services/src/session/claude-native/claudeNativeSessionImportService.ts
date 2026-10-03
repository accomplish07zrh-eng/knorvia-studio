import { access, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { normalize, resolve } from "node:path";

import type { KnorviaImportSessionsResult, KnorviaTaskMeta } from "@knorvia/shared";

import { createServiceLogger } from "#src/logger/serviceLogger.js";
import { buildImportedClaudeTaskFile } from "#src/session/claude-native/buildImportedClaudeTaskFile.js";
import type { ClaudeNativeImportedSessionSource } from "#src/session/claude-native/claudeNativeImportedSessionTypes.js";
import { claudeNativeSessionImportRepo } from "#src/session/claude-native/claudeNativeSessionImportRepo.js";
import { parseClaudeNativeSessionFile } from "#src/session/claude-native/claudeNativeSessionImportParser.js";
import {
  buildSearchableTextFromMessages,
  persistImportedClaudeTask,
  writeImportedClaudeTaskSnapshot,
} from "#src/session/claude-native/persistImportedClaudeTask.js";
import type { TaskIndexRepo } from "#src/session/taskIndexRepo.js";

const logger = createServiceLogger("claude-native-import");

function pathForComparison(path: string): string {
  const resolvedPath = normalize(resolve(path));
  return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
}

async function workspaceExists(workspacePath: string): Promise<boolean> {
  try {
    await access(workspacePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function cleanCreatedOutputs(paths: string[]): Promise<void> {
  for (const outputPath of new Set(paths)) {
    try {
      await rm(outputPath, { force: true });
    } catch {
      // 清理仅限复制端口报告的新建路径；单个删除失败不能打断后续清理或会话导入。
    }
  }
}

export async function importClaudeNativeSessions(params: {
  taskIndexRepo: TaskIndexRepo;
  workspacePath?: string;
  workspaceIdentity?: string;
  sessionIds: string[];
  createImportedSession?: (source: ClaudeNativeImportedSessionSource) => Promise<KnorviaTaskMeta>;
  onTaskImported: (meta: KnorviaTaskMeta) => void;
}): Promise<KnorviaImportSessionsResult> {
  const sessionIds = [...new Set(params.sessionIds.map((id) => id.trim()).filter(Boolean))];
  const result: KnorviaImportSessionsResult = { imported: [], skipped: [], failed: [] };
  logger.info(
    undefined,
    "开始导入 Claude 原生 session workspaceFilter=" +
      (params.workspacePath ?? "all") +
      " count=" +
      sessionIds.length,
  );

  for (const sessionId of sessionIds) {
    let createdOutputPaths: string[] = [];
    let importedWorkspacePath: string | undefined;
    try {
      const candidate = await claudeNativeSessionImportRepo.findImportableSession({
        workspacePath: params.workspacePath,
        sessionId,
      });
      if (!candidate) {
        result.skipped.push({
          provider: "claude",
          sessionId,
          reason: "session_not_found_or_workspace_mismatch",
          ...(params.workspacePath ? { workspacePath: params.workspacePath } : {}),
        });
        continue;
      }

      importedWorkspacePath = candidate.workspacePath;
      if (!(await workspaceExists(importedWorkspacePath))) {
        result.skipped.push({
          provider: "claude",
          sessionId,
          reason: "workspace_path_missing",
          workspacePath: importedWorkspacePath,
        });
        continue;
      }
      if (
        params.workspacePath &&
        pathForComparison(importedWorkspacePath) !== pathForComparison(params.workspacePath)
      ) {
        result.skipped.push({
          provider: "claude",
          sessionId,
          reason: "session_not_found_or_workspace_mismatch",
          workspacePath: importedWorkspacePath,
        });
        continue;
      }

      const copiedSession = await claudeNativeSessionImportRepo.copySessionFileToWorkspace({
        workspacePath: importedWorkspacePath,
        workspaceIdentity: params.workspacePath ? params.workspaceIdentity : undefined,
        sourcePath: candidate.sourcePath,
      });
      createdOutputPaths = copiedSession.createdOutputPaths;
      const importedSource = await parseClaudeNativeSessionFile({
        filePath: candidate.sourcePath,
        workspacePath: importedWorkspacePath,
        sessionId,
        sourcePath: candidate.sourcePath,
        fallbackCreatedAt: candidate.createdAt,
        fallbackUpdatedAt: candidate.updatedAt,
      });

      // await 之后再读取当前筛选状态；identity 是不解析、不裁剪的外部身份值。
      const targetWorkspaceIdentity = params.workspacePath ? params.workspaceIdentity : undefined;
      let meta: KnorviaTaskMeta;
      if (params.createImportedSession) {
        meta = await params.createImportedSession(importedSource);
        const sessionFile = buildImportedClaudeTaskFile(importedSource, undefined, meta.taskId);
        await writeImportedClaudeTaskSnapshot({
          sessionFile: {
            ...sessionFile,
            meta: {
              ...sessionFile.meta,
              ...(targetWorkspaceIdentity ? { workspaceIdentity: targetWorkspaceIdentity } : {}),
            },
          },
        });
        meta = await params.taskIndexRepo.syncTaskMeta({
          meta: {
            ...meta,
            migrationSource: "claudeCode",
            workspaceIdentity: targetWorkspaceIdentity ?? meta.workspaceIdentity,
          },
          searchableText: buildSearchableTextFromMessages(sessionFile.messages),
          archived: false,
          deleted: false,
        });
      } else {
        const sessionFile = buildImportedClaudeTaskFile(importedSource);
        meta = await persistImportedClaudeTask({
          taskIndexRepo: params.taskIndexRepo,
          sessionFile,
          workspaceIdentity: targetWorkspaceIdentity,
        });
      }

      params.onTaskImported(meta);
      result.imported.push({
        provider: "claude",
        sessionId,
        taskId: meta.taskId,
        workspacePath: meta.workspacePath,
      });
    } catch (error) {
      await cleanCreatedOutputs(createdOutputPaths);
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn(undefined, "导入 Claude 原生 session 失败 session=" + sessionId, error);
      result.failed.push({
        provider: "claude",
        sessionId,
        reason,
        ...(importedWorkspacePath ? { workspacePath: importedWorkspacePath } : {}),
      });
    }
  }

  logger.info(
    undefined,
    "Claude 原生 session 导入完成 imported=" +
      result.imported.length +
      " skipped=" +
      result.skipped.length +
      " failed=" +
      result.failed.length,
  );
  return result;
}
