import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";

export const MAX_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
export const MAX_FILES = 20_000;
export const ignoredDirectories = new Set([
  ".git",
  ".svn",
  ".hg",
  "node_modules",
  ".pnpm-store",
  ".cache",
  ".next",
  ".nuxt",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "dist",
  "build",
  "coverage",
  ".knorvia-studio",
]);
export type FileRecord = { hash: string; size: number; mode: number };
export type FileManifest = Record<string, FileRecord>;
export const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export const absent = (error: unknown) => (error as { code?: string })?.code === "ENOENT";
const comparable = (path: string) => (process.platform === "win32" ? path.toLowerCase() : path);

export function inside(root: string, path: string): boolean {
  const rest = relative(comparable(resolve(root)), comparable(resolve(path)));
  return (
    !isAbsolute(rest) &&
    rest !== ".." &&
    !rest.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  );
}

export function relativeFile(path: string): string {
  // Windows ADS、尾随点/空格和设备名会别名到另一个文件，必须跨平台统一拒绝。
  const parts = path.split("/");
  if (
    !path ||
    path.length > 1500 ||
    path.includes("\\") ||
    path.includes(":") ||
    [...path].some((character) => character.charCodeAt(0) < 32) ||
    isAbsolute(path) ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
        ignoredDirectories.has(part.toLowerCase()),
    )
  )
    throw new Error(`Unsafe workspace path: ${path}`);
  return path;
}

/** Verify each existing component, including root ancestors: realpath alone follows junctions. */
export async function safePath(path: string): Promise<void> {
  if (!isAbsolute(path)) throw new Error("Workspace paths must be absolute.");
  const root = parse(resolve(path)).root;
  let current = root;
  for (const segment of relative(root, resolve(path)).split(/[\\/]/).filter(Boolean)) {
    current = join(current, segment);
    const info = await lstat(current).catch((error) => {
      if (absent(error)) return null;
      throw error;
    });
    if (!info) continue;
    if (info.isSymbolicLink()) throw new Error(`Workspace links are not supported: ${current}`);
    if (!info.isDirectory() && !info.isFile())
      throw new Error(`Unsupported workspace entry: ${current}`);
    if (comparable(await realpath(current)) !== comparable(resolve(current)))
      throw new Error(`Workspace path redirects outside its declared location: ${current}`);
  }
}

export async function safeDirectory(path: string): Promise<void> {
  await safePath(path);
  await mkdir(path, { recursive: true });
  await safePath(path);
  if (!(await stat(path)).isDirectory()) throw new Error(`Expected directory: ${path}`);
}

export async function readSafeFile(root: string, path: string): Promise<Buffer | null> {
  relativeFile(path);
  const absolute = join(root, path);
  if (!inside(root, absolute)) throw new Error("Workspace path escaped its root.");
  await safePath(absolute);
  const info = await lstat(absolute).catch((error) => {
    if (absent(error)) return null;
    throw error;
  });
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1)
    throw new Error(`Expected an unlinked regular file: ${path}`);
  if (info.size > MAX_FILE_BYTES) throw new Error(`Workspace file exceeds 16 MiB: ${path}`);
  const handle = await open(absolute, "r");
  try {
    const opened = await handle.stat();
    if (opened.ino !== info.ino || opened.dev !== info.dev || opened.size !== info.size)
      throw new Error(`Workspace changed while reading: ${path}`);
    const data = await handle.readFile();
    const final = await handle.stat();
    await safePath(absolute);
    if (
      data.length > MAX_FILE_BYTES ||
      final.size !== opened.size ||
      final.mtimeMs !== opened.mtimeMs
    )
      throw new Error(`Workspace changed while reading: ${path}`);
    return data;
  } finally {
    await handle.close();
  }
}

export async function scanWorkspace(
  root: string,
  visit?: (path: string, data: Buffer, mode: number) => Promise<void>,
): Promise<FileManifest> {
  await safePath(root);
  if (!(await stat(root)).isDirectory()) throw new Error("Workspace source is not a directory.");
  const manifest: FileManifest = Object.create(null);
  let bytes = 0;
  let count = 0;
  let entriesSeen = 0;
  async function scan(directory: string, prefix: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (++entriesSeen > MAX_FILES * 2)
        throw new Error("Workspace contains too many entries to isolate safely.");
      if (ignoredDirectories.has(entry.name.toLowerCase())) continue;
      const path = relativeFile(`${prefix}${entry.name}`);
      const absolute = join(root, path);
      await safePath(absolute);
      const info = await lstat(absolute);
      if (info.isDirectory()) await scan(absolute, `${path}/`);
      else {
        const data = await readSafeFile(root, path);
        if (!data) throw new Error(`Workspace changed while copying: ${path}`);
        bytes += data.length;
        if (++count > MAX_FILES || bytes > MAX_TOTAL_BYTES)
          throw new Error(
            "Workspace exceeds the isolation limit (20,000 files / 256 MiB). Select a smaller project.",
          );
        manifest[path] = { hash: digest(data), size: data.length, mode: info.mode & 0o777 };
        await visit?.(path, data, info.mode & 0o777);
      }
    }
  }
  await scan(root, "");
  return manifest;
}

export async function exclusiveWrite(
  path: string,
  data: Uint8Array | string,
  mode = 0o600,
): Promise<void> {
  await safeDirectory(dirname(path));
  await safePath(path);
  const handle = await open(path, "wx", mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
