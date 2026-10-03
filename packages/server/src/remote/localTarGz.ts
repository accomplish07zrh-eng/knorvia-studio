import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";

export interface LocalTarGzEntry {
  sourcePath: string;
  archivePath: string;
}

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const BLOCK_SIZE = 512;

function readString(buffer: Buffer, offset: number, length: number): string {
  const field = buffer.subarray(offset, offset + length);
  const terminator = field.indexOf(0);
  return field.subarray(0, terminator < 0 ? field.length : terminator).toString("utf8");
}

function readOctal(buffer: Buffer, offset: number, length: number): number {
  return Number.parseInt(readString(buffer, offset, length).trim() || "0", 8);
}

function isZeroHeader(header: Buffer): boolean {
  return header.every((byte) => byte === 0);
}

function outsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

function extractionPath(root: string, original: string): string | undefined {
  const name = original.trim().replace(/^\.\/+/u, "");
  if (name === "" || name === ".") return undefined;

  const unsafe = (): never => {
    throw new Error(`[remote-assets] unsafe tar entry path: ${original}`);
  };
  if (name.includes("\\") || path.isAbsolute(name) || path.posix.isAbsolute(name)) {
    unsafe();
  }

  const normalized = path.posix.normalize(name).replace(/\/+$/, "");
  if (
    normalized === "" ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    unsafe();
  }

  const target = path.resolve(root, ...normalized.split("/"));
  if (outsideRoot(root, target)) unsafe();
  return target;
}

function normalizeLinkName(raw: string): string {
  const normalized = path.posix.normalize(raw);
  if (
    raw === "" ||
    normalized === "" ||
    normalized === "." ||
    normalized.includes("\\") ||
    path.isAbsolute(normalized) ||
    path.posix.isAbsolute(normalized) ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error(`[remote-assets] unsafe tar symlink target: ${raw}`);
  }
  return normalized;
}

async function applyMode(target: string, mode: number): Promise<void> {
  if (!mode) return;
  // Windows 等平台可能不支持归档权限；chmod 失败不影响已完成的内容解包。
  try {
    await fs.chmod(target, mode & 0o777);
  } catch {
    // 权限恢复是尽力操作，保留原有跨平台行为。
  }
}

export async function extractTarGzArchive(archivePath: string, targetDir: string): Promise<void> {
  const targetRoot = path.resolve(targetDir);
  await fs.mkdir(targetRoot, { recursive: true });
  const archive = await gunzipAsync(await fs.readFile(archivePath));
  let position = 0;
  let pendingName: string | undefined;

  while (position + BLOCK_SIZE <= archive.length) {
    const header = archive.subarray(position, position + BLOCK_SIZE);
    if (isZeroHeader(header)) break;
    const size = readOctal(header, 124, 12);
    const dataStart = position + BLOCK_SIZE;
    const dataEnd = dataStart + size;
    if (dataEnd > archive.length) {
      throw new Error(`[remote-assets] truncated tar entry in ${archivePath}`);
    }
    const data = archive.subarray(dataStart, dataEnd);
    position = dataStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
    // 入场条件已保证完整 512-byte header，单字节 API 明确表达此有界读取。
    const typeByte = header.readUInt8(156);
    const typeFlag = typeByte === 0 ? "0" : String.fromCharCode(typeByte);

    if (typeFlag === "L") {
      pendingName = readString(data, 0, data.length);
      continue;
    }
    if (typeFlag === "x" || typeFlag === "g") continue;

    const headerName = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const rawName = pendingName ?? (prefix ? `${prefix}/${headerName}` : headerName);
    pendingName = undefined;
    const target = extractionPath(targetRoot, rawName);
    if (target === undefined) continue;
    const mode = readOctal(header, 100, 8);

    if (typeFlag === "5") {
      await fs.mkdir(target, { recursive: true });
      await applyMode(target, mode);
    } else if (typeFlag === "0") {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
      await applyMode(target, mode);
    } else if (typeFlag === "2") {
      const rawLink = readString(header, 157, 100);
      const linkName = normalizeLinkName(rawLink);
      const parent = path.dirname(target);
      const linkTarget = path.resolve(parent, ...linkName.split("/"));
      if (outsideRoot(targetRoot, linkTarget)) {
        throw new Error(`[remote-assets] unsafe tar symlink target: ${rawLink}`);
      }
      await fs.mkdir(parent, { recursive: true });
      try {
        await fs.unlink(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await fs.symlink(linkName, target);
    } else {
      throw new Error(
        `[remote-assets] unsupported tar entry type ${JSON.stringify(typeFlag)} for ${rawName}`,
      );
    }
  }
}

function normalizeArchivePath(entryPath: string): string {
  const normalized = entryPath.replace(/^\.\/+/u, "").replace(/\/+$/, "");
  if (normalized === "" || normalized === ".") {
    throw new Error("[remote-assets] tar entry path must not be empty");
  }
  return normalized;
}

function splitHeaderPath(entryPath: string): { name: string; prefix: string } {
  if (Buffer.byteLength(entryPath, "utf8") <= 100) {
    return { name: entryPath, prefix: "" };
  }
  for (
    let slash = entryPath.lastIndexOf("/");
    slash > 0;
    slash = entryPath.lastIndexOf("/", slash - 1)
  ) {
    const prefix = entryPath.slice(0, slash);
    const name = entryPath.slice(slash + 1);
    if (Buffer.byteLength(prefix, "utf8") <= 155 && Buffer.byteLength(name, "utf8") <= 100) {
      return { name, prefix };
    }
  }
  throw new Error(`[remote-assets] tar entry path is too long: ${entryPath}`);
}

function writeOctal(header: Buffer, offset: number, length: number, value: number): void {
  const digits = Math.trunc(value)
    .toString(8)
    .padStart(length - 1, "0")
    .slice(-(length - 1));
  header.write(digits, offset, length - 1, "utf8");
}

function createHeader(
  entryPath: string,
  mode: number,
  mtime: number,
  size: number,
  typeFlag: string,
  linkName?: string,
): Buffer {
  const { name, prefix } = splitHeaderPath(entryPath);
  if (linkName && Buffer.byteLength(linkName, "utf8") > 100) {
    throw new Error(`[remote-assets] tar symlink target is too long: ${linkName}`);
  }
  const header = Buffer.alloc(BLOCK_SIZE);
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, mtime);
  header.fill(0x20, 148, 156);
  header.write(typeFlag, 156, 1, "utf8");
  if (linkName) header.write(linkName, 157, 100, "utf8");
  header.write("ustar", 257, 6, "utf8");
  header.write("00", 263, 2, "utf8");
  header.write("knorvia", 265, 32, "utf8");
  header.write("knorvia", 297, 32, "utf8");
  header.write(prefix, 345, 155, "utf8");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0").slice(-6), 148, 6, "utf8");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

async function appendEntry(blocks: Buffer[], entry: LocalTarGzEntry): Promise<void> {
  const stat = await fs.lstat(entry.sourcePath);
  const entryPath = normalizeArchivePath(entry.archivePath);
  const mtime = Math.floor(stat.mtimeMs / 1000);

  if (stat.isDirectory()) {
    // Windows 的目录 mode 不一定带可执行位，统一写入 0755 保持目录可遍历。
    blocks.push(createHeader(`${entryPath}/`, 0o755, mtime, 0, "5"));
    const children = await fs.readdir(entry.sourcePath, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      await appendEntry(blocks, {
        sourcePath: path.join(entry.sourcePath, child.name),
        archivePath: path.posix.join(entryPath, child.name),
      });
    }
  } else if (stat.isFile()) {
    const data = await fs.readFile(entry.sourcePath);
    blocks.push(createHeader(entryPath, stat.mode & 0o777, mtime, data.length, "0"));
    blocks.push(data);
    const padding = (BLOCK_SIZE - (data.length % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding) blocks.push(Buffer.alloc(padding));
  } else if (stat.isSymbolicLink()) {
    const rawLink = await fs.readlink(entry.sourcePath);
    const linkName = normalizeLinkName(rawLink);
    const archiveParent = path.posix.dirname(entryPath);
    const logicalTarget = path.posix.normalize(
      path.posix.join(archiveParent === "." ? "" : archiveParent, linkName),
    );
    if (
      logicalTarget === "" ||
      logicalTarget === "." ||
      logicalTarget === ".." ||
      logicalTarget.startsWith("../")
    ) {
      throw new Error(`[remote-assets] unsafe tar symlink target: ${rawLink}`);
    }
    blocks.push(createHeader(entryPath, 0o777, mtime, 0, "2", linkName));
  } else {
    throw new Error(`[remote-assets] unsupported local archive source: ${entry.sourcePath}`);
  }
}

export async function createTarGzArchive(
  archivePath: string,
  entries: readonly LocalTarGzEntry[],
): Promise<void> {
  const blocks: Buffer[] = [];
  for (const entry of entries) await appendEntry(blocks, entry);
  blocks.push(Buffer.alloc(BLOCK_SIZE * 2));
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  const archive = await gzipAsync(Buffer.concat(blocks));
  await fs.writeFile(archivePath, archive);
}
