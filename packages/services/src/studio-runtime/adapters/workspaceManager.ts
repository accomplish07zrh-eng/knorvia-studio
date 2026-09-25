import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { StudioWorkspacePort } from "../app/ports.js";
import type { StudioFileVersion, StudioWorkspaceChange } from "../types.js";
import { applySnapshot } from "./workspaceApply.js";
import {
  digest,
  exclusiveWrite,
  inside,
  readSafeFile,
  relativeFile,
  safeDirectory,
  safePath,
  scanWorkspace,
} from "./workspaceFiles.js";
import { withWorkspaceLock } from "./workspaceLocks.js";
import { recoverSourceApplies } from "./workspaceRecovery.js";
import {
  prepareSnapshot,
  readWorkspace,
  workspaceLocation,
  type WorkspaceMetadata,
} from "./workspaceSnapshot.js";

const hash = (data: Buffer | null) => (data === null ? null : digest(data));
/** 导入记录上限；元数据必须有界，不能随用户操作无限增长。 */
const IMPORT_LIMIT = 64;
interface ImportRecord {
  sourcePath: string;
  hash: string;
  size: number;
}
type MetadataWithImports = WorkspaceMetadata & { imports?: Record<string, ImportRecord> };
function preview(data: Buffer | null): { text: string | null; binary: boolean } {
  if (data === null) return { text: null, binary: false };
  if (data.length > 512 * 1024 || data.includes(0)) return { text: null, binary: true };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(data), binary: false };
  } catch {
    return { text: null, binary: true };
  }
}

export function createStudioWorkspaceManager(dataDir: string): StudioWorkspacePort {
  if (!isAbsolute(dataDir)) throw new Error("Studio data directory must be absolute.");
  const storage = resolve(dataDir);
  const active = new Map<string, Promise<unknown>>();
  const sourceKey = (path: string) =>
    `apply:${process.platform === "win32" ? path.toLowerCase() : path}`;
  async function locked<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = active.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => withWorkspaceLock(storage, key, operation));
    active.set(key, next);
    try {
      return await next;
    } finally {
      if (active.get(key) === next) active.delete(key);
    }
  }
  return {
    prepare(params) {
      const location = workspaceLocation(storage, params.runId, params.stepId);
      return locked(location.root, () => prepareSnapshot(location, params, storage));
    },
    async changes(runId, stepId) {
      const location = workspaceLocation(storage, runId, stepId);
      const metadata = await readWorkspace(location, runId, stepId);
      if (!metadata) throw new Error("Isolated workspace not found.");
      return locked(sourceKey(metadata.sourcePath), async () => {
        await recoverSourceApplies(storage, metadata.sourcePath);
        if (metadata.mode === "shared") return [];
        const isolated = await scanWorkspace(location.working);
        const paths = [
          ...new Set([...Object.keys(metadata.baseline), ...Object.keys(isolated)]),
        ].sort();
        const result: StudioWorkspaceChange[] = [];
        for (const path of paths) {
          const baselineHash = metadata.baseline[path]?.hash ?? null;
          const isolatedHash = isolated[path]?.hash ?? null;
          if (baselineHash === isolatedHash) continue;
          const beforeData = await readSafeFile(location.baseline, path);
          if (hash(beforeData) !== baselineHash)
            throw new Error(`Isolation baseline was modified: ${path}`);
          const afterData = await readSafeFile(location.working, path);
          const current = await readSafeFile(metadata.sourcePath, path);
          const before = preview(beforeData);
          const after = preview(afterData);
          result.push({
            path,
            kind: baselineHash === null ? "added" : isolatedHash === null ? "deleted" : "modified",
            before: before.text,
            after: after.text,
            binary: before.binary || after.binary,
            conflict: hash(current) !== baselineHash && hash(current) !== isolatedHash,
          });
        }
        return result;
      });
    },
    async apply(runId, stepId, paths) {
      const location = workspaceLocation(storage, runId, stepId);
      const metadata = await readWorkspace(location, runId, stepId);
      if (!metadata) throw new Error("Isolated workspace not found.");
      return locked(sourceKey(metadata.sourcePath), async () => {
        await recoverSourceApplies(storage, metadata.sourcePath);
        return applySnapshot(location, metadata, paths);
      });
    },
    async versions(runId, stepId, paths) {
      const location = workspaceLocation(storage, runId, stepId);
      const metadata = await readWorkspace(location, runId, stepId);
      if (!metadata) throw new Error("Isolated workspace not found.");
      // 验收取证：重读项目文件当前哈希；读不到就是读不到，绝不用 journal 记录冒充当前状态。
      return locked(sourceKey(metadata.sourcePath), async () => {
        const result: StudioFileVersion[] = [];
        for (const path of paths) {
          relativeFile(path);
          result.push({ path, hash: hash(await readSafeFile(metadata.sourcePath, path)) });
        }
        return result;
      });
    },
    async importFile({ runId, stepId, sourcePath, name }) {
      const location = workspaceLocation(storage, runId, stepId);
      const metadata = (await readWorkspace(location, runId, stepId)) as MetadataWithImports | null;
      if (!metadata) throw new Error("Isolated workspace not found.");
      const relative = relativeFile(name);
      if (!isAbsolute(sourcePath)) throw new Error("Imported files require an absolute path.");
      const source = resolve(sourcePath);
      // Studio 自己的数据目录不是用户项目；把它当输入会把运行记录再复制进工作区。
      if (inside(storage, source))
        throw new Error("Studio workspace storage cannot be imported as an input.");
      return locked(sourceKey(metadata.sourcePath), async () => {
        await safePath(source);
        const data = await readSafeFile(dirname(source), basename(source));
        if (!data) throw new Error("Imported file does not exist.");
        const sourceHash = digest(data);
        const root = metadata.mode === "shared" ? metadata.sourcePath : location.working;
        const destination = join(root, relative);
        if (!inside(root, destination))
          throw new Error("Imported file would escape the run workspace.");
        await safeDirectory(root);
        await exclusiveWrite(destination, data, 0o600);
        // 复制后重读：只有真实读回的一致哈希才算导入成功，源文件始终只读。
        const copied = await readSafeFile(root, relative);
        if (!copied || digest(copied) !== sourceHash || copied.length !== data.length)
          throw new Error("Imported file changed while copying.");
        await recordImport(location, metadata, relative, {
          sourcePath: source,
          hash: sourceHash,
          size: data.length,
        });
        return {
          path: relative,
          sourcePath: source,
          hash: sourceHash,
          size: data.length,
        };
      });
    },
    async referenceVersion(runId, stepId, relativePath) {
      const location = workspaceLocation(storage, runId, stepId);
      const metadata = await readWorkspace(location, runId, stepId);
      if (!metadata) throw new Error("Isolated workspace not found.");
      return locked(sourceKey(metadata.sourcePath), async () => {
        relativeFile(relativePath);
        const root = metadata.mode === "shared" ? metadata.sourcePath : location.working;
        // readSafeFile 拒绝符号链接、联接点、重定向与非普通文件；命中即抛错，不降级为"不存在"。
        return { path: relativePath, hash: hash(await readSafeFile(root, relativePath)) };
      });
    },
  };
}

/**
 * 把导入记录写进快照元数据。
 *
 * 元数据是唯一来源记录，因此先写临时文件再原子替换：异常不会留下半份元数据，
 * 也不会让"已复制的文件"失去来源。
 */
async function recordImport(
  location: { metadata: string },
  metadata: MetadataWithImports,
  path: string,
  record: ImportRecord,
): Promise<void> {
  const imports = { ...metadata.imports };
  if (!imports[path] && Object.keys(imports).length >= IMPORT_LIMIT)
    throw new Error(`A run imports at most ${IMPORT_LIMIT} files.`);
  imports[path] = record;
  const staging = `${location.metadata}.updating-${randomUUID()}`;
  await exclusiveWrite(staging, JSON.stringify({ ...metadata, imports }));
  await rename(staging, location.metadata);
}
