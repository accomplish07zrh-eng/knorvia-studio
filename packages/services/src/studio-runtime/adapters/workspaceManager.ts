import { isAbsolute, resolve } from "node:path";
import type { StudioWorkspacePort } from "../app/ports.js";
import type { StudioWorkspaceChange } from "../types.js";
import { applySnapshot } from "./workspaceApply.js";
import { digest, readSafeFile, scanWorkspace } from "./workspaceFiles.js";
import { withWorkspaceLock } from "./workspaceLocks.js";
import { recoverSourceApplies } from "./workspaceRecovery.js";
import { prepareSnapshot, readWorkspace, workspaceLocation } from "./workspaceSnapshot.js";

const hash = (data: Buffer | null) => (data === null ? null : digest(data));
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
  };
}
