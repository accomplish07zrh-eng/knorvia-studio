import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import {
  absent,
  digest,
  exclusiveWrite,
  MAX_FILE_BYTES,
  MAX_FILES,
  relativeFile,
  safePath,
} from "./workspaceFiles.js";
import type { WorkspaceLocation, WorkspaceMetadata } from "./workspaceSnapshot.js";

export type JournalState =
  | "preparing"
  | "applying"
  | "rolling-back"
  | "complete"
  | "rolled-back"
  | "rollback-incomplete";
export interface JournalChange {
  path: string;
  beforeHash: string | null;
  afterHash: string | null;
  mode: number;
  destination: string;
  staging: string;
  backup: string;
  rollback?: string;
}
export interface WorkspaceJournal {
  state: JournalState;
  changes: JournalChange[];
  error?: string;
}
const MAX_JOURNAL_BYTES = 32 * 1024 * 1024;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const journalName = new RegExp(`^apply-(${uuid})\\.json$`);
const validHash = (value: unknown) =>
  value === null || (typeof value === "string" && /^[0-9a-f]{64}$/.test(value));
export const contentHash = (data: Buffer | null) => (data === null ? null : digest(data));
export const workspaceError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export async function writeWorkspaceJournal(
  path: string,
  journal: WorkspaceJournal,
): Promise<void> {
  const text = JSON.stringify(journal);
  if (Buffer.byteLength(text) > MAX_JOURNAL_BYTES)
    throw new Error("Workspace apply journal exceeds its size limit.");
  const staged = `${path}.${randomUUID()}.tmp`;
  await exclusiveWrite(staged, text);
  await safePath(path);
  await fs.rename(staged, path);
}

export async function readWorkspaceJournal(
  location: WorkspaceLocation,
  metadata: WorkspaceMetadata,
  name: string,
): Promise<WorkspaceJournal> {
  const transaction = journalName.exec(name)?.[1];
  if (!transaction) throw new Error(`Invalid workspace apply journal name: ${name}`);
  const path = join(location.root, name);
  await safePath(path);
  const info = await fs.lstat(path);
  if (!info.isFile() || info.nlink !== 1 || info.size > MAX_JOURNAL_BYTES)
    throw new Error(`Invalid workspace apply journal: ${path}`);
  let record: WorkspaceJournal;
  try {
    record = JSON.parse(await fs.readFile(path, "utf8")) as WorkspaceJournal;
  } catch (cause) {
    throw new Error(`Workspace apply journal cannot be read; preserved for review: ${path}`, {
      cause,
    });
  }
  if (
    !record ||
    ![
      "preparing",
      "applying",
      "rolling-back",
      "complete",
      "rolled-back",
      "rollback-incomplete",
    ].includes(record.state) ||
    !Array.isArray(record.changes) ||
    !record.changes.length ||
    record.changes.length > MAX_FILES
  )
    throw new Error(`Invalid workspace apply journal: ${path}`);
  const paths = new Set<string>();
  for (const [index, change] of record.changes.entries()) {
    if (!change || typeof change.path !== "string")
      throw new Error(`Invalid workspace journal entry: ${path}`);
    relativeFile(change.path);
    const key = process.platform === "win32" ? change.path.toLowerCase() : change.path;
    const destination = join(metadata.sourcePath, change.path);
    const prefix = join(dirname(destination), `.knorvia-apply-${transaction}-${index}`);
    if (
      paths.has(key) ||
      !validHash(change.beforeHash) ||
      !validHash(change.afterHash) ||
      change.beforeHash === change.afterHash ||
      change.beforeHash !== (metadata.baseline[change.path]?.hash ?? null) ||
      !Number.isInteger(change.mode) ||
      change.destination !== destination ||
      change.staging !== `${prefix}.tmp` ||
      change.backup !== `${prefix}.bak` ||
      (change.rollback !== undefined &&
        (typeof change.rollback !== "string" ||
          !change.rollback.startsWith(`${prefix}.rollback-`) ||
          !new RegExp(`^${uuid}$`).test(change.rollback.slice(`${prefix}.rollback-`.length))))
    )
      throw new Error(
        `Workspace journal does not match its isolation record: ${path} (${change.path})`,
      );
    paths.add(key);
  }
  return record;
}

/** Allows only the exact hard-link pairs our exclusive publish/restore protocol creates. */
export async function readRecoveryFile(path: string, peers: string[]): Promise<Buffer | null> {
  await safePath(path);
  const info = await fs.lstat(path).catch((error) => {
    if (absent(error)) return null;
    throw error;
  });
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES)
    throw new Error(`Recovery expected a regular workspace file: ${path}`);
  let knownLinks = 1;
  for (const peer of new Set(peers)) {
    if (peer === path) continue;
    await safePath(peer);
    const other = await fs.lstat(peer).catch((error) => {
      if (absent(error)) return null;
      throw error;
    });
    if (other?.isFile() && other.ino === info.ino && other.dev === info.dev) knownLinks++;
  }
  if (info.nlink !== knownLinks)
    throw new Error(`Recovery found an unrecognized hard link: ${path}`);
  const handle = await fs.open(path, "r");
  try {
    const opened = await handle.stat();
    if (opened.ino !== info.ino || opened.dev !== info.dev || opened.size !== info.size)
      throw new Error(`Workspace changed during recovery inspection: ${path}`);
    const data = await handle.readFile();
    const final = await handle.stat();
    await safePath(path);
    const current = await fs.lstat(path);
    if (
      data.length > MAX_FILE_BYTES ||
      final.size !== opened.size ||
      final.mtimeMs !== opened.mtimeMs ||
      current.ino !== opened.ino ||
      current.dev !== opened.dev
    )
      throw new Error(`Workspace changed during recovery inspection: ${path}`);
    return data;
  } finally {
    await handle.close();
  }
}

export const journalPeers = (change: JournalChange): string[] => [
  change.destination,
  change.staging,
  change.backup,
  ...(change.rollback ? [change.rollback] : []),
];

export async function removeKnownFile(
  path: string,
  expected: string | null,
  peers: string[],
): Promise<void> {
  const data = await readRecoveryFile(path, peers);
  if (data === null) return;
  if (contentHash(data) !== expected) throw new Error(`Preserved changed recovery file: ${path}`);
  await safePath(path);
  await fs.unlink(path);
}
