import { chmod, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { normalizePluginSyncRelativePath, resolvePluginSyncPathWithin } from "./pluginSyncPath.js";

export const PLUGIN_SYNC_METADATA_ARCHIVE_PATH = ".knorvia-plugin-sync.json";

export interface PluginSyncArchiveMetadata {
  plugins: Array<{ name: string; pluginId: string; directoryName: string; enabled?: boolean }>;
  marketplaceSources?: Array<{ marketplaceId: string; directoryName: string }>;
}

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const pathOptions = { unsafePathLabel: "unsafe plugin archive path" };
const blockSize = 512;

function headerText(header: Buffer, offset: number, width: number, value: string): void {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > width) {
    throw new Error(`plugin archive header value is too long: ${value}`);
  }
  bytes.copy(header, offset);
}

function headerNumber(header: Buffer, offset: number, width: number, value: number): void {
  const octal = value.toString(8).padStart(width - 1, "0");
  if (octal.length > width - 1) {
    throw new Error(`plugin archive header value is too long: ${octal}`);
  }
  headerText(header, offset, width, octal + "\0");
}

function fitPath(entryPath: string): { name: string; prefix: string } {
  if (Buffer.byteLength(entryPath, "utf8") <= 100) {
    return { name: entryPath, prefix: "" };
  }
  const segments = entryPath.split("/");
  for (let split = segments.length - 1; split > 0; split -= 1) {
    const prefix = segments.slice(0, split).join("/");
    const name = segments.slice(split).join("/");
    if (Buffer.byteLength(prefix, "utf8") <= 155 && Buffer.byteLength(name, "utf8") <= 100) {
      return { name, prefix };
    }
  }
  throw new Error(`plugin archive path is too long: ${entryPath}`);
}

function makeHeader(
  entryPath: string,
  size: number,
  mode: number,
  mtimeMs: number,
  type: "0" | "5",
): Buffer {
  const header = Buffer.alloc(blockSize);
  const path = fitPath(entryPath);
  headerText(header, 0, 100, path.name);
  headerNumber(header, 100, 8, mode & 0o777);
  headerNumber(header, 108, 8, 0);
  headerNumber(header, 116, 8, 0);
  headerNumber(header, 124, 12, size);
  headerNumber(header, 136, 12, Math.floor(mtimeMs / 1000));
  header.fill(0x20, 148, 156);
  headerText(header, 156, 1, type);
  headerText(header, 257, 6, "ustar");
  headerText(header, 263, 2, "00");
  headerText(header, 265, 32, "knorvia");
  headerText(header, 297, 32, "knorvia");
  headerText(header, 345, 155, path.prefix);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  headerText(header, 148, 6, checksum.toString(8).padStart(6, "0"));
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

export async function createPluginSyncArchive(params: {
  entries: readonly (
    | { sourcePath: string; archivePath: string }
    | { content: string | Uint8Array; archivePath: string; mode?: number; mtimeMs?: number }
  )[];
  metadata: PluginSyncArchiveMetadata;
}): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  function appendFile(archivePath: string, content: Buffer, mode: number, mtimeMs: number): void {
    chunks.push(makeHeader(archivePath, content.length, mode, mtimeMs, "0"), content);
    const remainder = content.length % blockSize;
    if (remainder !== 0) chunks.push(Buffer.alloc(blockSize - remainder));
  }
  async function visitSource(sourcePath: string, archivePath: string): Promise<void> {
    const stats = await lstat(sourcePath);
    if (stats.isDirectory()) {
      const directoryName = archivePath.endsWith("/") ? archivePath : archivePath + "/";
      chunks.push(makeHeader(directoryName, 0, stats.mode, stats.mtimeMs, "5"));
      const children = await readdir(sourcePath, { withFileTypes: true });
      children.sort((left, right) => left.name.localeCompare(right.name));
      for (const child of children) {
        const childSourcePath = join(sourcePath, child.name);
        const childArchivePath = normalizePluginSyncRelativePath(
          posix.join(archivePath, child.name),
          pathOptions,
        );
        await visitSource(childSourcePath, childArchivePath);
      }
      return;
    }
    if (stats.isFile()) {
      const content = await readFile(sourcePath);
      appendFile(archivePath, content, stats.mode, stats.mtimeMs);
      return;
    }
    throw new Error(`unsupported plugin archive source: ${sourcePath}`);
  }
  for (const entry of params.entries) {
    if ("sourcePath" in entry) {
      const sourcePath = entry.sourcePath;
      const archivePath = normalizePluginSyncRelativePath(entry.archivePath, pathOptions);
      await visitSource(sourcePath, archivePath);
    } else {
      const archivePath = normalizePluginSyncRelativePath(entry.archivePath, pathOptions);
      const content =
        typeof entry.content === "string"
          ? Buffer.from(entry.content, "utf8")
          : Buffer.from(entry.content);
      const mode = entry.mode;
      const mtimeMs = entry.mtimeMs;
      appendFile(
        archivePath,
        content,
        mode === undefined ? 0o644 : mode,
        mtimeMs === undefined ? Date.now() : mtimeMs,
      );
    }
  }
  appendFile(
    PLUGIN_SYNC_METADATA_ARCHIVE_PATH,
    Buffer.from(JSON.stringify(params.metadata, null, 2) + "\n", "utf8"),
    0o644,
    Date.now(),
  );
  chunks.push(Buffer.alloc(1024));
  return await compress(Buffer.concat(chunks));
}

function fieldText(header: Buffer, offset: number, width: number): string {
  const bytes = header.subarray(offset, offset + width);
  const nul = bytes.indexOf(0);
  return bytes.subarray(0, nul < 0 ? bytes.length : nul).toString("utf8");
}

function fieldNumber(header: Buffer, offset: number, width: number): number {
  const text = fieldText(header, offset, width).trim();
  return text === "" ? 0 : Number.parseInt(text, 8);
}

export async function extractPluginSyncArchive(
  archive: Uint8Array,
  targetDir: string,
  options: { maxExtractedBytes?: number } = {},
): Promise<void> {
  const root = resolve(targetDir);
  await mkdir(root, { recursive: true });
  const maxExtractedBytes = options.maxExtractedBytes;
  let tar: Buffer;
  if (maxExtractedBytes === undefined) {
    tar = await decompress(Buffer.from(archive));
  } else {
    try {
      tar = await decompress(Buffer.from(archive), {
        maxOutputLength: maxExtractedBytes + 1024 + blockSize * 512,
      });
    } catch (error) {
      throw new Error(
        "plugin sync archive exceeds limit: " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
  let cursor = 0;
  let extractedBytes = 0;
  while (cursor + blockSize <= tar.length) {
    const header = tar.subarray(cursor, cursor + blockSize);
    if (header.every((byte) => byte === 0)) break;
    const size = fieldNumber(header, 124, 12);
    const payloadStart = cursor + blockSize;
    if (payloadStart + size > tar.length) {
      throw new Error("truncated plugin sync archive entry");
    }
    const payload = tar.subarray(payloadStart, payloadStart + size);
    cursor = payloadStart + Math.ceil(size / blockSize) * blockSize;
    const typeFlag = fieldText(header, 156, 1) || "0";
    const name = fieldText(header, 0, 100);
    const prefix = fieldText(header, 345, 155);
    const archivePath = normalizePluginSyncRelativePath(
      prefix ? prefix + "/" + name : name,
      pathOptions,
    );
    const target = resolvePluginSyncPathWithin(root, archivePath, pathOptions);
    if (typeFlag === "5") {
      await mkdir(target, { recursive: true });
    } else if (typeFlag === "0" || typeFlag === "\0") {
      extractedBytes += size;
      if (maxExtractedBytes !== undefined && extractedBytes > maxExtractedBytes) {
        throw new Error(
          `plugin sync archive exceeds limit: ${extractedBytes}/${maxExtractedBytes}`,
        );
      }
      const mode = fieldNumber(header, 100, 8);
      const fileMode = Number.isFinite(mode) && mode > 0 ? mode & 0o777 : 0o644;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, payload, { mode: fileMode });
      if (process.platform !== "win32") await chmod(target, fileMode);
    } else {
      throw new Error(`unsupported plugin archive entry type: ${typeFlag}`);
    }
  }
}
