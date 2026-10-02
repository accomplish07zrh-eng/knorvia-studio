import { execFile } from "node:child_process";
import type { WSLDistro } from "@knorvia/shared";

export type { WSLDistro } from "@knorvia/shared";
export type WSLBufferExecutor = (args: string[]) => Promise<Buffer>;
export const WSL_DISCOVERY_CACHE_TTL_MS = 5000;

interface DiscoveryEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
}

let availabilityCache = new WeakMap<WSLBufferExecutor, DiscoveryEntry<boolean>>();
let distroCache = new WeakMap<WSLBufferExecutor, DiscoveryEntry<WSLDistro[]>>();

function normalizeWSLOutput(value: string): string {
  return value
    .replaceAll("\0", "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "");
}

function decodeWSLOutput(buffer: Buffer): string {
  if (buffer.length === 0) return "";
  return buffer.toString(buffer.includes(0) ? "utf16le" : "utf8");
}

function executeWSL(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "wsl.exe",
      args,
      { encoding: "buffer", maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const outputBuffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? "");
        const errorBuffer = Buffer.isBuffer(stderr) ? stderr : Buffer.from(stderr ?? "");
        if (error) {
          reject(
            new Error(normalizeWSLOutput(decodeWSLOutput(errorBuffer)).trim() || error.message),
          );
          return;
        }
        resolve(outputBuffer);
      },
    );
  });
}

export function parseWSLDistroList(rawOutput: string): WSLDistro[] {
  const distros: WSLDistro[] = [];
  for (const rawLine of normalizeWSLOutput(rawOutput).split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const columns = line
      .trim()
      .split(/\s{2,}/)
      .map((column) => column.trim())
      .filter(Boolean);
    if (columns.length < 3) continue;

    const versionToken = columns[columns.length - 1] ?? "";
    const parsedVersion = Number.parseInt(versionToken, 10);
    if (!Number.isFinite(parsedVersion)) continue;
    const state = columns[columns.length - 2] ?? "";
    const nameToken = columns.slice(0, -2).join(" ").trim();
    const isDefault = nameToken.startsWith("*");
    const name = nameToken.replace(/^\*\s*/, "").trim();
    if (!name) continue;
    distros.push({
      name,
      isDefault,
      state,
      version: parsedVersion === 1 || parsedVersion === 2 ? parsedVersion : null,
    });
  }
  return distros;
}

function loadDiscovery<T>(
  cache: WeakMap<WSLBufferExecutor, DiscoveryEntry<T>>,
  executor: WSLBufferExecutor,
  load: () => Promise<T>,
): Promise<T> {
  const current = cache.get(executor);
  if (current && current.expiresAt > Date.now()) return current.promise;

  const entry: DiscoveryEntry<T> = {
    expiresAt: Date.now() + WSL_DISCOVERY_CACHE_TTL_MS,
    promise: Promise.resolve().then(load),
  };
  cache.set(executor, entry);
  void entry.promise.catch(() => {
    if (cache.get(executor) === entry) cache.delete(executor);
  });
  return entry.promise;
}

export async function isWSLAvailable(executor: WSLBufferExecutor = executeWSL): Promise<boolean> {
  if (process.platform !== "win32") return false;
  return loadDiscovery(availabilityCache, executor, async () => {
    try {
      await executor(["--status"]);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return !/not recognized|enoent/i.test(message);
    }
  });
}

export async function listWSLDistros(
  executor: WSLBufferExecutor = executeWSL,
): Promise<WSLDistro[]> {
  if (process.platform !== "win32") return [];
  return loadDiscovery(distroCache, executor, async () => {
    const output = await executor(["-l", "-v", "--all"]);
    return parseWSLDistroList(decodeWSLOutput(output));
  });
}

export function invalidateWSLDiscoveryCache(executor?: WSLBufferExecutor): void {
  if (executor) {
    availabilityCache.delete(executor);
    distroCache.delete(executor);
    return;
  }
  availabilityCache = new WeakMap();
  distroCache = new WeakMap();
}
