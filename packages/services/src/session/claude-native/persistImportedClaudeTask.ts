// Behavior/public-port owner candidate.
// Existing Apache/NOTICE and dependency obligations remain applicable.
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { KnorviaSessionFile, KnorviaTaskMeta } from "@knorvia/shared";
import { getLegacyTaskSessionSnapshotPath } from "#src/paths.js";
import {
  parseLegacyTaskSessionFile,
  type LegacyTaskSessionFile,
} from "#src/session/legacyTaskSessionFile.js";
import type { TaskIndexRepo } from "#src/session/taskIndexRepo.js";

export function buildSearchableTextFromMessages(messages: KnorviaSessionFile["messages"]): string {
  const limit = 200000;
  let text = "";

  for (const message of messages) {
    const content = message.content.trim();
    if (!content) continue;

    const fragment = text ? `\n${content}` : content;
    const remaining = limit - text.length;
    if (fragment.length > remaining) {
      return text + fragment.slice(0, remaining);
    }
    text += fragment;
  }

  return text;
}

export async function writeImportedClaudeTaskSnapshot(params: {
  sessionFile: LegacyTaskSessionFile;
}): Promise<void> {
  const file = parseLegacyTaskSessionFile(params.sessionFile);
  const filePath = getLegacyTaskSessionSnapshotPath(
    file.meta.workspacePath,
    file.meta.taskId,
    file.meta.workspaceIdentity,
  );
  const tempPath =
    filePath +
    "." +
    process.pid +
    "." +
    Date.now().toString(36) +
    "." +
    Math.random().toString(36).slice(2, 8) +
    ".tmp";
  const text = JSON.stringify(file, null, 2) + "\n";

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(tempPath, text, "utf-8");
  await rename(tempPath, filePath);
}

export async function persistImportedClaudeTask(params: {
  taskIndexRepo: TaskIndexRepo;
  sessionFile: LegacyTaskSessionFile;
  workspaceIdentity?: string;
}): Promise<KnorviaTaskMeta> {
  const parsed = parseLegacyTaskSessionFile(params.sessionFile);
  const meta = {
    ...parsed.meta,
    ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
  };
  const indexMeta: KnorviaTaskMeta = {
    ...meta,
    mode: meta.mode ?? "build",
  };

  await writeImportedClaudeTaskSnapshot({
    sessionFile: { ...parsed, meta },
  });
  return await params.taskIndexRepo.syncTaskMeta({
    meta: indexMeta,
    archived: false,
    deleted: false,
    searchableText: buildSearchableTextFromMessages(parsed.messages),
  });
}
