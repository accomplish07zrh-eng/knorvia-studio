import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { readProjectMemoryFileFromStableHandle } from "#src/memory/projectMemoryStableRead.js";
import { getKnorviaDataRootDir } from "#src/paths.js";
import type {
  IMemoryService,
  ProjectMemoryFileSummary,
  ProjectMemoryWorkspaceSummary,
} from "./memory.js";

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function isPlainDirectory(path: string): Promise<boolean> {
  try {
    const metadata = await lstat(path);
    return metadata.isDirectory() && !metadata.isSymbolicLink();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function requirePlainDirectory(path: string): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`Project Memory directory is not a regular directory: ${path}`);
  }
}

async function requireRoot(): Promise<string> {
  const root = join(getKnorviaDataRootDir(), "cli", "memories", "projects");
  await requirePlainDirectory(root);
  return root;
}

function isMemoryFileName(name: string): boolean {
  return name === "MEMORY.md" || (name.endsWith(".md") && name !== "MEMORY.md");
}

function isPathSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    basename(value) === value &&
    !value.includes("/") &&
    !value.includes("\\")
  );
}

async function requireExactFile(memoryRoot: string, fileName: string): Promise<string> {
  const entries = await readdir(memoryRoot, { withFileTypes: true });
  const entry = entries.find((candidate) => candidate.name === fileName);
  const filePath = join(memoryRoot, fileName);
  if (!entry) {
    await lstat(filePath);
    throw new Error(`Project Memory file name does not match exactly: ${fileName}`);
  }
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new Error(`Project Memory file is not a regular file: ${fileName}`);
  }
  return filePath;
}

async function requireContained(root: string, target: string): Promise<void> {
  const rootReal = await realpath(root);
  const targetReal = await realpath(target);
  const targetRelative = relative(rootReal, targetReal);
  if (
    targetRelative === ".." ||
    targetRelative.startsWith(`..${sep}`) ||
    isAbsolute(targetRelative)
  ) {
    throw new Error(`Project Memory path is outside the local profile: ${target}`);
  }
}

async function listProjectMemories(): Promise<ProjectMemoryWorkspaceSummary[]> {
  let root: string;
  let entries;
  try {
    root = await requireRoot();
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }

  const workspaces: ProjectMemoryWorkspaceSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const workspaceId = entry.name;
    const workspaceRoot = join(root, workspaceId);
    const memoryRoot = join(workspaceRoot, "memory");
    if (!(await isPlainDirectory(workspaceRoot)) || !(await isPlainDirectory(memoryRoot))) {
      continue;
    }

    let memoryEntries;
    try {
      memoryEntries = await readdir(memoryRoot, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }

    const files: ProjectMemoryFileSummary[] = [];
    for (const memoryEntry of memoryEntries) {
      if (
        !memoryEntry.isFile() ||
        memoryEntry.isSymbolicLink() ||
        !isMemoryFileName(memoryEntry.name)
      ) {
        continue;
      }
      const filePath = join(memoryRoot, memoryEntry.name);
      let metadata;
      try {
        metadata = await lstat(filePath);
      } catch (error) {
        if (isMissing(error)) continue;
        throw error;
      }
      if (!metadata.isFile() || metadata.isSymbolicLink()) continue;
      files.push({
        name: memoryEntry.name,
        path: filePath,
        kind: memoryEntry.name === "MEMORY.md" ? "index" : "item",
        size: metadata.size,
        updatedAt: metadata.mtimeMs,
      });
    }
    if (files.length === 0) continue;
    files.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "index" ? -1 : 1;
      return left.name.localeCompare(right.name, "en");
    });
    const slug = /^(.*)-[a-f0-9]{16}$/i.exec(workspaceId)?.[1];
    workspaces.push({
      id: workspaceId,
      label: slug?.trim() || workspaceId,
      updatedAt: Math.max(...files.map((file) => file.updatedAt)),
      files,
    });
  }
  workspaces.sort(
    (left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id, "en"),
  );
  return workspaces;
}

async function readProjectMemoryFile(params: {
  workspaceId: string;
  fileName: string;
}): Promise<{ content: string; updatedAt: number }> {
  if (
    !isPathSegment(params.workspaceId) ||
    !isPathSegment(params.fileName) ||
    !isMemoryFileName(params.fileName)
  ) {
    throw new Error("Invalid Project Memory path");
  }
  const root = await requireRoot();
  const workspaceRoot = join(root, params.workspaceId);
  const memoryRoot = join(workspaceRoot, "memory");
  await requirePlainDirectory(workspaceRoot);
  await requirePlainDirectory(memoryRoot);
  const filePath = await requireExactFile(memoryRoot, params.fileName);
  return readProjectMemoryFileFromStableHandle({
    fileName: params.fileName,
    filePath,
    validatePath: async () => {
      await requireRoot();
      await requirePlainDirectory(workspaceRoot);
      await requirePlainDirectory(memoryRoot);
      await requireExactFile(memoryRoot, params.fileName);
      await requireContained(root, filePath);
    },
  });
}

export function createMemoryService(): IMemoryService {
  return { listProjectMemories, readProjectMemoryFile };
}
