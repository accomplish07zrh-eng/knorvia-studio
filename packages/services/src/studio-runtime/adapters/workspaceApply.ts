import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  exclusiveWrite,
  MAX_TOTAL_BYTES,
  readSafeFile,
  relativeFile,
  safeDirectory,
  safePath,
} from "./workspaceFiles.js";
import {
  contentHash,
  journalPeers,
  readRecoveryFile,
  removeKnownFile,
  writeWorkspaceJournal,
  type JournalChange,
  type WorkspaceJournal,
} from "./workspaceJournal.js";
import { recoverWorkspaceJournal } from "./workspaceRecovery.js";
import type { WorkspaceLocation, WorkspaceMetadata } from "./workspaceSnapshot.js";

export async function applySnapshot(
  location: WorkspaceLocation,
  metadata: WorkspaceMetadata,
  paths: string[],
): Promise<void> {
  if (metadata.mode === "shared")
    throw new Error("Shared workspaces already write directly to the project.");
  if (
    !paths.length ||
    paths.length > 20_000 ||
    new Set(paths.map((path) => (process.platform === "win32" ? path.toLowerCase() : path)))
      .size !== paths.length
  )
    throw new Error("Select distinct workspace files to apply.");
  const transactionId = randomUUID();
  const changes: JournalChange[] = [];
  const contents = new Map<string, Buffer>();
  let totalBytes = 0;
  for (const path of paths) {
    relativeFile(path);
    const before = await readSafeFile(location.baseline, path);
    const beforeHash = contentHash(before);
    if (beforeHash !== (metadata.baseline[path]?.hash ?? null))
      throw new Error(`Isolation baseline was modified: ${path}`);
    const after = await readSafeFile(location.working, path);
    const afterHash = contentHash(after);
    totalBytes += (before?.length ?? 0) + (after?.length ?? 0);
    if (totalBytes > MAX_TOTAL_BYTES * 2)
      throw new Error("Selected changes exceed the workspace apply limit.");
    const current = await readSafeFile(metadata.sourcePath, path);
    if (beforeHash === afterHash) throw new Error(`Selected file has no isolated changes: ${path}`);
    if (contentHash(current) === afterHash) continue;
    if (contentHash(current) !== beforeHash)
      throw new Error(`Project file changed since isolation: ${path}`);
    const destination = join(metadata.sourcePath, path);
    changes.push({
      path,
      beforeHash,
      afterHash,
      mode: metadata.baseline[path]?.mode ?? 0o644,
      destination,
      staging: join(dirname(destination), `.knorvia-apply-${transactionId}-${changes.length}.tmp`),
      backup: join(dirname(destination), `.knorvia-apply-${transactionId}-${changes.length}.bak`),
    });
    if (after !== null) contents.set(path, after);
  }
  if (!changes.length) return;
  const name = `apply-${transactionId}.json`;
  const path = join(location.root, name);
  const journal: WorkspaceJournal = { state: "preparing", changes };
  // Record every recovery path before creating staging files or touching the project.
  await writeWorkspaceJournal(path, journal);
  try {
    for (const change of changes) {
      await safeDirectory(dirname(change.destination));
      const after = contents.get(change.path);
      if (after !== undefined) await exclusiveWrite(change.staging, after, change.mode);
    }
    journal.state = "applying";
    await writeWorkspaceJournal(path, journal);
    for (const change of changes) {
      await safePath(change.destination);
      if (contentHash(await readSafeFile(metadata.sourcePath, change.path)) !== change.beforeHash)
        throw new Error(`Project changed during apply: ${change.path}`);
      if (change.beforeHash !== null) {
        await safePath(change.backup);
        await fs.rename(change.destination, change.backup);
        if (
          contentHash(await readRecoveryFile(change.backup, journalPeers(change))) !==
          change.beforeHash
        )
          throw new Error(`Project changed while applying: ${change.path}`);
      }
      if (change.afterHash !== null) {
        await safePath(change.staging);
        await safePath(change.destination);
        if (
          contentHash(await readRecoveryFile(change.staging, journalPeers(change))) !==
          change.afterHash
        )
          throw new Error(`Staged file changed while applying: ${change.path}`);
        await fs.link(change.staging, change.destination);
        await removeKnownFile(change.staging, change.afterHash, journalPeers(change));
      }
      await writeWorkspaceJournal(path, journal);
    }
    journal.state = "complete";
    await writeWorkspaceJournal(path, journal);
    // Commit is durable before cleanup; a cleanup failure must never reverse accepted edits.
    for (const change of changes)
      await removeKnownFile(change.backup, change.beforeHash, journalPeers(change));
  } catch (error) {
    try {
      if ((await recoverWorkspaceJournal(location, metadata, name)) === "complete") return;
    } catch (recoveryError) {
      throw new Error(
        recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
        { cause: error },
      );
    }
    throw error;
  }
}
