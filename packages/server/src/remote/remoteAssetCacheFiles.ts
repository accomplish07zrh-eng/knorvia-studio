// Internal partition of the same root-authored cache owner; no new rights claim.
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type Stats } from "node:fs";
import {
  constants as fsConstants,
  copyFile,
  link,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as wait } from "node:timers/promises";
import { fileExists } from "@knorvia/server/remote/deployShared.js";
import { normalizeRemoteAssetRelativePath } from "@knorvia/server/remote/remoteAssetCdn.js";
import type { Loggers, Context } from "./remoteAssetCacheModel.js";
import { problem } from "./remoteAssetCacheModel.js";

const markers = [".ready", ".remote-assets-ready"] as const;

const retryDelays = [50, 100, 200, 400, 800, 1600, 3200];

export async function readCachedRemoteAssetMarker(cacheDir: string): Promise<string | null> {
  for (const marker of markers) {
    try {
      return await readFile(path.join(cacheDir, marker), "utf8");
    } catch {}
  }
  return null;
}

export async function info(target: string) {
  try {
    return await stat(target);
  } catch {
    return undefined;
  }
}

export async function markedDirectory(dir: string): Promise<boolean> {
  if (!(await info(dir))?.isDirectory()) return false;
  for (const marker of markers) if (await fileExists(dir, marker)) return true;
  return false;
}

export async function fullRelease(dir: string, platform: string): Promise<boolean> {
  if (!(await info(dir))?.isDirectory()) return false;
  if (!(await fileExists(dir, "server", "knorvia-server.cjs"))) return false;
  if (!(await fileExists(dir, "node", platform, "node"))) return false;
  for (const marker of markers) if (await fileExists(dir, marker)) return true;
  return false;
}

export function contained(base: string, relative: string, label: string): string {
  const normalized = normalizeRemoteAssetRelativePath(relative, label);
  const root = path.resolve(base),
    target = path.resolve(root, normalized);
  const distance = path.relative(root, target);
  if (distance === ".." || distance.startsWith(`..${path.sep}`) || path.isAbsolute(distance))
    throw problem(`${label} escapes base dir: ${relative}`);
  return target;
}

export async function absentPaths(base: string, required: readonly string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const relative of required) {
    const target = contained(base, relative, "required cache path");
    if (!(await info(target))) missing.push(target);
  }
  return missing;
}

export async function componentReadiness(dir: string, required: readonly string[]) {
  if (!(await markedDirectory(dir)))
    return { ready: false, missing: [] as string[], marked: false };
  const missing = await absentPaths(dir, required);
  return { ready: missing.length === 0, missing, marked: true };
}

export async function releaseReady(
  dir: string,
  c: Context,
  required: readonly string[],
): Promise<boolean> {
  return (await fullRelease(dir, c.platform)) && (await absentPaths(dir, required)).length === 0;
}

export async function markerAt(dir: string): Promise<void> {
  await writeFile(path.join(dir, ".ready"), `${Date.now()}\n`, "utf8");
}

export function stageAt(c: Context, label: string): string {
  return path.join(c.cache, "staging", `${label}-${process.pid}-${randomUUID()}`);
}

function retryable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"].includes(String(error.code))
  );
}

async function retryFs(action: () => Promise<void>): Promise<void> {
  let retry = 0;
  while (true) {
    try {
      await action();
      return;
    } catch (error) {
      const delay = retryDelays[retry];
      if (delay === undefined || !retryable(error)) throw error;
      retry++;
      await wait(delay);
    }
  }
}

export async function commitDirectory(staged: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  let backup: string | undefined;
  if (await info(target)) {
    backup = `${target}.backup-${process.pid}-${randomUUID()}`;
    await retryFs(() => rename(target, backup!));
  }
  try {
    await retryFs(() => rename(staged, target));
  } catch (commitError) {
    if (backup !== undefined) {
      try {
        await retryFs(() => rename(backup!, target));
      } catch (restoreError) {
        throw problem(
          `failed to commit staged directory and failed to restore backup: commit=${String(commitError)}, restore=${String(restoreError)}`,
        );
      }
    }
    throw commitError;
  }
  if (backup !== undefined) {
    try {
      await retryFs(() => rm(backup!, { recursive: true, force: true }));
    } catch {}
  }
}

export async function materialize(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === ".ready" || entry.name === ".remote-assets-ready") continue;
    const from = path.join(source, entry.name),
      to = path.join(target, entry.name);
    if (entry.isSymbolicLink()) throw problem(`symlink is not allowed in component cache: ${from}`);
    if (entry.isDirectory()) {
      await materialize(from, to);
      continue;
    }
    if (!entry.isFile()) throw problem(`unsupported component entry type: ${from}`);
    try {
      await link(from, to);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (!["EXDEV", "EPERM", "EACCES", "EMLINK"].includes(String(code))) throw error;
      await copyFile(from, to, fsConstants.COPYFILE_EXCL);
    }
  }
}

export async function nonempty(dir: string, message: string): Promise<void> {
  if ((await readdir(dir)).length === 0) throw problem(message);
}

export async function digestFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}

export async function unpackedDigest(root: string): Promise<string> {
  const hash = createHash("sha256"),
    rootInfo = await stat(root);
  const appendFile = async (absolute: string, relative: string, details: Stats) => {
    hash.update(`file:${relative}:${details.mode & 0o777}:${details.size}\n`);
    for await (const bytes of createReadStream(absolute)) hash.update(bytes);
  };
  const visit = async (absolute: string, prefix: string): Promise<void> => {
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const item = path.join(absolute, entry.name),
        relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const details = await stat(item);
        hash.update(`dir:${relative}:${details.mode & 0o777}\n`);
        await visit(item, relative);
      } else if (entry.isFile()) await appendFile(item, relative, await stat(item));
      else throw new Error(`unsupported entry type: ${item}`);
    }
  };
  if (rootInfo.isDirectory()) {
    hash.update("root:dir\n");
    await visit(root, "");
  } else if (rootInfo.isFile()) {
    hash.update("root:file\n");
    await appendFile(root, "root-file", rootInfo);
  } else throw new Error(`unsupported path type: ${root}`);
  return hash.digest("hex");
}

export async function download(
  response: Response,
  destination: string,
  loggers: Loggers,
): Promise<void> {
  if (!response.body) throw new Error("response body is empty");
  await mkdir(path.dirname(destination), { recursive: true });
  const rawTotal = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  const total = Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : undefined;
  const started = Date.now();
  let transferred = 0,
    lastTime = 0,
    lastPercent = 0,
    lastTransferred = -1;
  const report = (forced: boolean) => {
    const now = Date.now(),
      percent = total === undefined ? undefined : Math.min((transferred / total) * 100, 100);
    if (
      forced &&
      lastTransferred === transferred &&
      (percent === undefined || percent <= lastPercent)
    )
      return;
    if (
      !forced &&
      now - lastTime < 1000 &&
      (percent === undefined || (percent - lastPercent < 5 && percent < 100))
    )
      return;
    const megabytes = transferred / (1024 * 1024),
      speed = megabytes / Math.max((now - started) / 1000, 0.001);
    loggers.log(
      percent === undefined
        ? `[remote-assets] download progress: ${megabytes.toFixed(1)} MB (total unknown, ${speed.toFixed(2)} MB/s)`
        : `[remote-assets] download progress: ${percent.toFixed(1)}% (${megabytes.toFixed(1)}/${(total! / (1024 * 1024)).toFixed(1)} MB, ${speed.toFixed(2)} MB/s)`,
    );
    lastTime = now;
    lastTransferred = transferred;
    if (percent !== undefined) lastPercent = percent;
  };
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        transferred += chunk.byteLength;
        report(false);
        callback(null, chunk);
      } catch (error) {
        callback(error as Error);
      }
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    meter,
    createWriteStream(destination),
  );
  report(true);
}
