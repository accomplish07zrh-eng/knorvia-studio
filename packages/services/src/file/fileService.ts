import { mkdir, readdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { WORKSPACE_FILE_SEARCH_DISPLAY_CAP } from "@knorvia/shared/workspaceFileSearch";
import { createServiceLogger } from "../logger/serviceLogger.js";
import { getConversationWorkspaceDir, getKnorviaDataRootDir } from "../paths.js";
import type { IFileService } from "./file.js";
import { createWorkspaceIndexOwner } from "./fileServiceIndex.js";
import {
  classifyFileEntry,
  readBinaryFilePreview,
  readByteRange,
  readMediaFilePreview,
  readTextSlice,
} from "./fileServiceIO.js";
import { defaultWorkspaceFileSearchFilter } from "./workspaceFileMentionFilter.js";
import type { WorkspaceFileSearchFilter } from "./workspaceFileMentionFilter.js";
import { buildHostFileSearchCandidates, searchHostFileCandidates } from "./workspaceFileSearch.js";
import {
  readWorkspaceFileSearchIgnore,
  transformWorkspaceFileSearchIgnore,
  writeWorkspaceFileSearchIgnore,
} from "./workspaceFileIgnore.js";

export interface CreateFileServiceOptions {
  workspaceFileSearchFilter?: WorkspaceFileSearchFilter;
}

export function createFileService(options: CreateFileServiceOptions = {}): IFileService {
  const filter = options.workspaceFileSearchFilter ?? defaultWorkspaceFileSearchFilter;
  const logger = createServiceLogger("workspace-file-ignore");
  const ensureIndex = createWorkspaceIndexOwner(filter, logger);
  const existence = new Map<string, { exists: boolean; expiresAt: number }>();
  const existencePending = new Map<string, Promise<boolean>>();

  function cachedExistence(path: string): boolean | undefined {
    const cached = existence.get(path);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      existence.delete(path);
      return undefined;
    }
    existence.delete(path);
    existence.set(path, cached);
    return cached.exists;
  }

  function rememberExistence(path: string, exists: boolean): void {
    const now = Date.now();
    for (const [key, cached] of existence) {
      if (cached.expiresAt <= now) existence.delete(key);
    }
    existence.delete(path);
    existence.set(path, { exists, expiresAt: now + 60000 });
    while (existence.size > 100) {
      const oldest = existence.keys().next().value;
      if (oldest === undefined) break;
      existence.delete(oldest);
    }
  }

  async function checkExistence(path: string): Promise<boolean> {
    const cached = cachedExistence(path);
    if (cached !== undefined) return cached;
    const pending = existencePending.get(path);
    if (pending) return pending;
    const checking = stat(path)
      .then((metadata) => metadata.isFile())
      .catch(() => false)
      .then((exists) => {
        rememberExistence(path, exists);
        return exists;
      })
      .finally(() => existencePending.delete(path));
    existencePending.set(path, checking);
    return checking;
  }

  async function prepareWorkspace(path: string): Promise<{ path: string }> {
    await mkdir(path, { recursive: true });
    if (!(await stat(path)).isDirectory())
      throw new Error(`Workspace path is not a directory: ${path}`);
    return { path };
  }

  return {
    async readdir(params) {
      const children = await readdir(params.path, { withFileTypes: true });
      const entries = await Promise.all(
        children
          .filter((child) => params.includeHidden === true || !child.name.startsWith("."))
          .map(async (child) => {
            const path = join(params.path, child.name);
            return {
              name: child.name,
              path,
              type: await classifyFileEntry(path, child),
              isSymbolicLink: child.isSymbolicLink(),
            };
          }),
      );
      entries.sort((left, right) => {
        if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
      return entries;
    },
    async stat(params) {
      const metadata = await stat(params.path);
      const directory = metadata.isDirectory();
      return {
        path: params.path,
        type: directory ? "directory" : "file",
        ...(directory ? {} : { size: metadata.size, mtimeMs: metadata.mtimeMs }),
      };
    },
    async checkFilesExist(params) {
      if (params.paths.length > 15)
        throw new Error("File existence check supports at most 15 paths.");
      return Promise.all(
        params.paths.map(async (path) => ({ path, exists: await checkExistence(path) })),
      );
    },
    async resolvePath(params) {
      return realpath(params.path);
    },
    async createDefaultWorkspace() {
      return prepareWorkspace(join(getKnorviaDataRootDir(), "workspace", "projects"));
    },
    async ensureConversationWorkspace() {
      const path = getConversationWorkspaceDir();
      let created = false;
      try {
        created = (await mkdir(path, { recursive: true })) !== undefined;
      } catch (error) {
        const metadata = await stat(path).catch(() => null);
        if (!metadata) throw error;
        if (!metadata.isDirectory())
          throw new Error(`Workspace path is not a directory: ${path}`, { cause: error });
      }
      if (!(await stat(path)).isDirectory())
        throw new Error(`Workspace path is not a directory: ${path}`);
      return { path, created, workspacePurpose: "conversation" };
    },
    async createScratchWorkspace(params) {
      const name = params.name.trim();
      if (!name) throw new Error("Workspace name is required.");
      if (/[\\/]/.test(name)) throw new Error("Workspace name cannot contain path separators.");
      return prepareWorkspace(join(getKnorviaDataRootDir(), "workspace", "projects", name));
    },
    async readTextFile(params) {
      return readTextSlice(params);
    },
    async readFileRange(params) {
      return readByteRange(params);
    },
    async readMediaPreview(params) {
      return readMediaFilePreview(params);
    },
    async readBinaryPreview(params) {
      return readBinaryFilePreview(params);
    },
    async searchWorkspaceFiles(params) {
      const requestedLimit = params.limit ?? WORKSPACE_FILE_SEARCH_DISPLAY_CAP;
      if (!Number.isFinite(requestedLimit) || typeof params.query !== "string") {
        throw new Error("Invalid workspace file search query or limit");
      }
      const limit = Math.min(
        WORKSPACE_FILE_SEARCH_DISPLAY_CAP,
        Math.max(0, Math.trunc(requestedLimit)),
      );
      if (limit === 0) return [];
      const index = await ensureIndex(params.rootPath, params.workspaceIdentity, params.refresh);
      index.candidates ??= buildHostFileSearchCandidates(index.packed, params.rootPath);
      return searchHostFileCandidates(await index.candidates, params.query, limit);
    },
    async listWorkspaceFilesLength(params) {
      return (await ensureIndex(params.rootPath)).packed.length;
    },
    async listWorkspaceFilesRange(params) {
      const index = await ensureIndex(params.rootPath);
      const offset = Math.max(0, Math.trunc(params.offset));
      if (offset >= index.packed.length) return "";
      const length = Math.max(0, Math.trunc(params.length));
      return index.packed.slice(offset, Math.min(index.packed.length, offset + length));
    },
    async readWorkspaceFileSearchIgnore(params) {
      return readWorkspaceFileSearchIgnore(params.rootPath);
    },
    async applyWorkspaceFileSearchIgnoreTransform(params) {
      return transformWorkspaceFileSearchIgnore(params.rootPath, params.transform);
    },
    async writeWorkspaceFileSearchIgnore(params) {
      await writeWorkspaceFileSearchIgnore(params.rootPath, params.content);
    },
  };
}
