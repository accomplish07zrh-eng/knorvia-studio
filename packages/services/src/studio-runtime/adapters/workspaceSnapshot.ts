import { readFile, rename, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { studioProjectKey } from "../domain/projectIdentity.js";
import {
  absent,
  digest,
  exclusiveWrite,
  inside,
  MAX_FILES,
  relativeFile,
  safeDirectory,
  safePath,
  scanWorkspace,
  type FileManifest,
} from "./workspaceFiles.js";

export interface WorkspaceMetadata {
  version: 1;
  runId: string;
  stepId: string;
  sourcePath: string;
  mode: "isolated" | "shared";
  baseline: FileManifest;
}
export interface WorkspaceLocation {
  root: string;
  working: string;
  baseline: string;
  metadata: string;
}

export function workspaceLocation(
  dataDir: string,
  runId: string,
  stepId: string,
): WorkspaceLocation {
  if (!runId || !stepId || runId.length > 500 || stepId.length > 500)
    throw new Error("Invalid workspace run or step identifier.");
  const root = join(resolve(dataDir), "workspaces", digest(JSON.stringify([runId, stepId])));
  return {
    root,
    working: join(root, "working"),
    baseline: join(root, "baseline"),
    metadata: join(root, "metadata.json"),
  };
}

export async function readWorkspace(
  location: WorkspaceLocation,
  runId: string,
  stepId: string,
): Promise<WorkspaceMetadata | null> {
  await safePath(location.metadata);
  const info = await stat(location.metadata).catch((error) => {
    if (absent(error)) return null;
    throw error;
  });
  if (!info) return null;
  if (!info.isFile() || info.size > 8 * 1024 * 1024)
    throw new Error("Invalid or oversized workspace metadata.");
  const content = await readFile(location.metadata, "utf8").catch((error) => {
    if (absent(error)) return null;
    throw error;
  });
  if (content === null) return null;
  if (content.length > 8 * 1024 * 1024) throw new Error("Workspace metadata exceeds its limit.");
  const data = JSON.parse(content) as WorkspaceMetadata;
  if (
    data.version !== 1 ||
    data.runId !== runId ||
    data.stepId !== stepId ||
    typeof data.sourcePath !== "string" ||
    !["isolated", "shared"].includes(data.mode) ||
    !data.baseline ||
    typeof data.baseline !== "object"
  )
    throw new Error("Invalid workspace metadata.");
  if (Object.keys(data.baseline).length > MAX_FILES)
    throw new Error("Workspace metadata exceeds its file limit.");
  for (const [path, record] of Object.entries(data.baseline)) {
    relativeFile(path);
    if (
      !record ||
      !/^[0-9a-f]{64}$/.test(record.hash) ||
      !Number.isSafeInteger(record.size) ||
      record.size < 0 ||
      !Number.isInteger(record.mode)
    )
      throw new Error("Invalid workspace baseline record.");
  }
  await safePath(data.sourcePath);
  return data;
}

export async function prepareSnapshot(
  location: WorkspaceLocation,
  params: { runId: string; stepId: string; sourcePath: string; mode: "isolated" | "shared" },
  dataDir: string,
): Promise<string> {
  if (!isAbsolute(params.sourcePath)) throw new Error("Workspace source must be an absolute path.");
  const sourcePath = resolve(params.sourcePath);
  await safePath(sourcePath);
  if (!(await stat(sourcePath)).isDirectory())
    throw new Error("Workspace source is not a directory.");
  const existing = await readWorkspace(location, params.runId, params.stepId);
  if (existing) {
    if (
      studioProjectKey(existing.sourcePath) !== studioProjectKey(sourcePath) ||
      existing.mode !== params.mode
    )
      throw new Error("This run/step already belongs to another workspace or isolation mode.");
    const target = existing.mode === "shared" ? sourcePath : location.working;
    await safePath(target);
    if (!(await stat(target)).isDirectory())
      throw new Error("Prepared workspace directory is missing.");
    return target;
  }
  if (params.mode === "isolated" && inside(sourcePath, dataDir))
    throw new Error("The project contains Studio's workspace storage. Select a narrower project.");
  await safeDirectory(dirname(location.root));
  const staging = `${location.root}.preparing-${randomUUID()}`;
  await safeDirectory(staging);
  const metadata: WorkspaceMetadata = {
    version: 1,
    runId: params.runId,
    stepId: params.stepId,
    sourcePath,
    mode: params.mode,
    baseline: {},
  };
  if (params.mode === "isolated") {
    // staging 保留异常诊断，不递归删除用户或上次任务目录；只有完整快照才发布 metadata。
    await safeDirectory(join(staging, "working"));
    await safeDirectory(join(staging, "baseline"));
    metadata.baseline = await scanWorkspace(sourcePath, async (path, data, mode) => {
      await exclusiveWrite(join(staging, "working", path), data, mode);
      await exclusiveWrite(join(staging, "baseline", path), data, mode);
    });
    const verify = await scanWorkspace(sourcePath);
    if (
      Object.keys(verify).length !== Object.keys(metadata.baseline).length ||
      Object.entries(verify).some(([path, file]) => metadata.baseline[path]?.hash !== file.hash)
    )
      throw new Error("Source project changed during isolation. Retry after its writes finish.");
  }
  await exclusiveWrite(join(staging, "metadata.json"), JSON.stringify(metadata));
  // 元数据与两份目录一次发布，异常不能留下被误认成完整快照的半成品。
  await rename(staging, location.root);
  return params.mode === "shared" ? sourcePath : location.working;
}
