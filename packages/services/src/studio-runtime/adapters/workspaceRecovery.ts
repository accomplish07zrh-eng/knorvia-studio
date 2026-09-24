import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { absent, readSafeFile, safePath } from "./workspaceFiles.js";
import {
  contentHash,
  journalName,
  journalPeers,
  readRecoveryFile,
  readWorkspaceJournal,
  removeKnownFile,
  workspaceError,
  writeWorkspaceJournal,
  type JournalChange,
  type WorkspaceJournal,
} from "./workspaceJournal.js";
import {
  readWorkspace,
  workspaceLocation,
  type WorkspaceLocation,
  type WorkspaceMetadata,
} from "./workspaceSnapshot.js";

async function inspectChange(location: WorkspaceLocation, change: JournalChange) {
  if (contentHash(await readSafeFile(location.baseline, change.path)) !== change.beforeHash)
    throw new Error(`Isolation baseline was modified: ${change.path}`);
  const peers = journalPeers(change);
  const [current, staging, backup, rollback] = await Promise.all([
    readRecoveryFile(change.destination, peers),
    readRecoveryFile(change.staging, peers),
    readRecoveryFile(change.backup, peers),
    change.rollback ? readRecoveryFile(change.rollback, peers) : null,
  ]);
  for (const [name, data, expected] of [
    [change.staging, staging, change.afterHash],
    [change.backup, backup, change.beforeHash],
    [change.rollback, rollback, change.afterHash],
  ] as const)
    if (data !== null && contentHash(data) !== expected)
      throw new Error(`Preserved changed recovery file: ${name}`);
  return {
    current: contentHash(current),
    backup: contentHash(backup),
    staging: contentHash(staging),
    rollback: contentHash(rollback),
  };
}

async function cleanupChange(change: JournalChange): Promise<void> {
  const peers = journalPeers(change);
  await removeKnownFile(change.staging, change.afterHash, peers);
  await removeKnownFile(change.backup, change.beforeHash, peers);
  if (change.rollback) await removeKnownFile(change.rollback, change.afterHash, peers);
}

async function rollbackChange(
  location: WorkspaceLocation,
  path: string,
  journal: WorkspaceJournal,
  change: JournalChange,
): Promise<void> {
  const state = await inspectChange(location, change);
  if (state.current === change.beforeHash) {
    await cleanupChange(change);
    return;
  }
  if (state.current !== change.afterHash && state.current !== null)
    throw new Error(
      `Project file changed during interrupted apply; user edit preserved: ${change.path}`,
    );
  if (
    change.beforeHash !== null &&
    change.afterHash !== null &&
    state.current === null &&
    state.staging === null &&
    state.rollback === null
  )
    throw new Error(`Project file was removed after publish; deletion preserved: ${change.path}`);
  if (change.beforeHash !== null && state.backup !== change.beforeHash)
    throw new Error(`Original backup is missing; recovery preserved the project: ${change.path}`);
  if (state.current !== null) {
    if (change.rollback)
      await removeKnownFile(change.rollback, change.afterHash, journalPeers(change));
    change.rollback = `${change.staging.slice(0, -4)}.rollback-${randomUUID()}`;
    await writeWorkspaceJournal(path, journal);
    await safePath(change.destination);
    await safePath(change.rollback);
    // Capture first; never unlink a project file based on an earlier hash check.
    await fs.rename(change.destination, change.rollback);
    if (
      contentHash(await readRecoveryFile(change.rollback, journalPeers(change))) !==
      change.afterHash
    ) {
      // A user write raced the capture. Restore exclusively if its path is still free.
      await fs.link(change.rollback, change.destination).catch(() => {});
      throw new Error(
        `Project changed while rolling back; original edit preserved at ${change.destination} or ${change.rollback}`,
      );
    }
  }
  if (change.beforeHash !== null) {
    await safePath(change.backup);
    await safePath(change.destination);
    if (
      contentHash(await readRecoveryFile(change.backup, journalPeers(change))) !== change.beforeHash
    )
      throw new Error(`Backup changed during recovery; preserved: ${change.backup}`);
    // Exclusive link cannot overwrite a new file created by the user during recovery.
    await fs.link(change.backup, change.destination);
  }
  if (
    contentHash(await readRecoveryFile(change.destination, journalPeers(change))) !==
    change.beforeHash
  )
    throw new Error(`Project changed during recovery; user edit preserved: ${change.path}`);
  await cleanupChange(change);
}

export async function recoverWorkspaceJournal(
  location: WorkspaceLocation,
  metadata: WorkspaceMetadata,
  name: string,
): Promise<"complete" | "rolled-back"> {
  const path = join(location.root, name);
  const journal = await readWorkspaceJournal(location, metadata, name);
  if (journal.state === "complete" || journal.state === "rolled-back") {
    for (const change of journal.changes) await cleanupChange(change);
    return journal.state;
  }
  let allInstalled = !["rolling-back", "rollback-incomplete"].includes(journal.state);
  for (const change of journal.changes) {
    try {
      if ((await inspectChange(location, change)).current !== change.afterHash)
        allInstalled = false;
    } catch {
      allInstalled = false;
    }
  }
  // Even an outdated applying journal can prove commit once every exact after-hash is present.
  if (allInstalled) {
    journal.state = "complete";
    delete journal.error;
    await writeWorkspaceJournal(path, journal);
    for (const change of journal.changes) await cleanupChange(change);
    return "complete";
  }
  journal.state = "rolling-back";
  await writeWorkspaceJournal(path, journal);
  const errors: string[] = [];
  for (const change of [...journal.changes].reverse()) {
    try {
      await rollbackChange(location, path, journal, change);
    } catch (error) {
      errors.push(workspaceError(error));
    }
  }
  journal.state = errors.length ? "rollback-incomplete" : "rolled-back";
  journal.error = errors.length ? errors.join("; ") : undefined;
  await writeWorkspaceJournal(path, journal);
  if (errors.length)
    throw new Error(
      `An interrupted workspace apply has unresolved conflicts; concurrent edits were preserved. Review ${path}. ${errors.join("; ")}`,
    );
  return "rolled-back";
}

/** Caller must hold the source project apply lock throughout this scan and recovery. */
export async function recoverSourceApplies(storage: string, sourcePath: string): Promise<void> {
  const directory = join(storage, "workspaces");
  await safePath(directory);
  const entries = await fs.readdir(directory).catch((error) => {
    if (absent(error)) return [];
    throw error;
  });
  if (entries.length > 5_000)
    throw new Error("Workspace recovery exceeds the 5,000 isolation-record inspection limit.");
  const normalize = (path: string) =>
    process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  for (const entry of entries) {
    // Incomplete prepare staging directories are never published workspaces.
    if (!/^[0-9a-f]{64}$/.test(entry)) continue;
    const root = join(directory, entry);
    const metadataPath = join(root, "metadata.json");
    await safePath(metadataPath);
    const info = await fs.lstat(metadataPath).catch((error) => {
      if (absent(error)) return null;
      throw error;
    });
    if (!info)
      throw new Error(`Published workspace has no isolation record; preserved for review: ${root}`);
    if (!info.isFile() || info.nlink !== 1 || info.size > 8 * 1024 * 1024)
      throw new Error(`Invalid workspace metadata: ${metadataPath}`);
    const header = JSON.parse(await fs.readFile(metadataPath, "utf8")) as WorkspaceMetadata;
    if (
      typeof header?.sourcePath !== "string" ||
      typeof header.runId !== "string" ||
      typeof header.stepId !== "string"
    )
      throw new Error(`Invalid workspace source record: ${metadataPath}`);
    if (normalize(header.sourcePath) !== normalize(sourcePath)) continue;
    const location = workspaceLocation(storage, header.runId, header.stepId);
    if (location.root !== root)
      throw new Error(`Workspace isolation identity changed: ${metadataPath}`);
    const metadata = await readWorkspace(location, header.runId, header.stepId);
    if (!metadata) throw new Error(`Workspace isolation record disappeared: ${metadataPath}`);
    const journals = (await fs.readdir(root)).filter((name) => journalName.test(name)).sort();
    if (journals.length > 2_000)
      throw new Error(`Workspace exceeds the 2,000 apply-journal inspection limit: ${root}`);
    for (const name of journals) await recoverWorkspaceJournal(location, metadata, name);
  }
}
