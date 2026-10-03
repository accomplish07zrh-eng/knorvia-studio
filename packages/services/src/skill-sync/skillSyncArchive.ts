import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { createGunzip, gzip } from "node:zlib";
import { createSkillSyncSizeLimitError } from "./skillSyncErrors.js";
import { normalizeSkillSyncRelativePath, resolveSkillSyncPathWithin } from "./skillSyncPath.js";

const blockSize = 512;
const archivePathOptions = { unsafePathLabel: "unsafe skill archive path" };
const compressArchive = promisify(gzip);

interface ArchiveSource {
  sourcePath: string;
  archivePath: string;
}

function splitHeaderPath(entryPath: string): { name: string; prefix: string } {
  if (Buffer.byteLength(entryPath) <= 100) return { name: entryPath, prefix: "" };
  let boundary = entryPath.lastIndexOf("/");
  while (boundary >= 0) {
    const prefix = entryPath.slice(0, boundary);
    const name = entryPath.slice(boundary + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
    boundary = entryPath.lastIndexOf("/", boundary - 1);
  }
  throw new Error(`skill archive path is too long: ${entryPath}`);
}

function writeOctal(header: Buffer, offset: number, length: number, value: number): void {
  const field = Math.trunc(value)
    .toString(8)
    .padStart(length - 1, "0")
    .slice(-(length - 1));
  header.write(field, offset, length - 1, "utf8");
}

function createHeader(
  entryPath: string,
  mode: number,
  modifiedSeconds: number,
  size: number,
  typeFlag: "0" | "5",
): Buffer {
  const header = Buffer.alloc(blockSize);
  const { name, prefix } = splitHeaderPath(entryPath);
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 100, 8, mode & 0o777);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, modifiedSeconds);
  header.fill(0x20, 148, 156);
  header.write(typeFlag, 156, 1, "utf8");
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

async function appendSource(parts: Buffer[], sourcePath: string, entryPath: string): Promise<void> {
  const archivePath = normalizeSkillSyncRelativePath(entryPath, archivePathOptions);
  const details = await lstat(sourcePath);
  const modifiedSeconds = Math.floor(details.mtimeMs / 1000);
  if (details.isDirectory()) {
    parts.push(createHeader(`${archivePath}/`, details.mode, modifiedSeconds, 0, "5"));
    const children = await readdir(sourcePath, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      await appendSource(parts, join(sourcePath, child.name), posix.join(archivePath, child.name));
    }
    return;
  }
  if (!details.isFile()) throw new Error(`unsupported skill archive source: ${sourcePath}`);
  const content = await readFile(sourcePath);
  parts.push(
    createHeader(archivePath, details.mode, modifiedSeconds, content.length, "0"),
    content,
  );
  const padding = (blockSize - (content.length % blockSize)) % blockSize;
  if (padding) parts.push(Buffer.alloc(padding));
}

export async function createSkillSyncArchive(
  entries: readonly ArchiveSource[],
): Promise<Uint8Array> {
  const parts: Buffer[] = [];
  for (const entry of entries) await appendSource(parts, entry.sourcePath, entry.archivePath);
  parts.push(Buffer.alloc(blockSize * 2));
  return compressArchive(Buffer.concat(parts));
}

class ArchiveByteReader {
  private readonly iterator: AsyncIterator<Buffer>;
  private readonly chunks: Buffer[] = [];
  private headOffset = 0;
  private bufferedBytes = 0;
  private ended = false;

  constructor(stream: Readable) {
    this.iterator = stream[Symbol.asyncIterator]();
  }

  private async fill(requiredBytes: number): Promise<void> {
    while (!this.ended && this.bufferedBytes < requiredBytes) {
      const item = await this.iterator.next();
      if (item.done) {
        this.ended = true;
      } else if (item.value.length) {
        this.chunks.push(item.value);
        this.bufferedBytes += item.value.length;
      }
    }
  }

  private consume(count: number, output?: Buffer): void {
    let written = 0;
    while (written < count) {
      const chunk = this.chunks[0]!;
      const taking = Math.min(count - written, chunk.length - this.headOffset);
      if (output) chunk.copy(output, written, this.headOffset, this.headOffset + taking);
      written += taking;
      this.headOffset += taking;
      this.bufferedBytes -= taking;
      if (this.headOffset === chunk.length) {
        this.chunks.shift();
        this.headOffset = 0;
      }
    }
  }

  async readExact(count: number): Promise<Buffer | null> {
    if (!count) return Buffer.alloc(0);
    await this.fill(count);
    if (!this.bufferedBytes) return null;
    if (this.bufferedBytes < count) throw new Error("truncated skill sync archive");
    const output = Buffer.alloc(count);
    this.consume(count, output);
    return output;
  }

  async skip(count: number): Promise<void> {
    if (!count) return;
    await this.fill(count);
    if (this.bufferedBytes < count) throw new Error("truncated skill sync archive");
    this.consume(count);
  }

  async drain(): Promise<void> {
    while (!this.ended) {
      const item = await this.iterator.next();
      this.ended = Boolean(item.done);
    }
  }
}

function headerText(header: Buffer, offset: number, length: number): string {
  const field = header.subarray(offset, offset + length);
  const terminator = field.indexOf(0);
  return field.subarray(0, terminator < 0 ? field.length : terminator).toString("utf8");
}

function headerSize(header: Buffer): number {
  const text = headerText(header, 124, 12).trim();
  const size = text ? Number.parseInt(text, 8) : 0;
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error("invalid skill sync archive entry size");
  }
  return size;
}

export async function extractSkillSyncArchive(
  archive: Uint8Array,
  targetDir: string,
  options: { maxExtractedBytes?: number } = {},
): Promise<void> {
  const targetRoot = resolve(targetDir);
  await mkdir(targetRoot, { recursive: true });
  const maxExtractedBytes = options.maxExtractedBytes;
  const input = Readable.from([Buffer.from(archive)]);
  const gunzip = createGunzip();
  input.pipe(gunzip);
  const reader = new ArchiveByteReader(gunzip);
  let extractedBytes = 0;
  try {
    for (;;) {
      const header = await reader.readExact(blockSize);
      if (header === null) break;
      if (header.every((byte) => byte === 0)) {
        await reader.drain();
        break;
      }
      const size = headerSize(header);
      const typeFlag = headerText(header, 156, 1) || "0";
      const name = headerText(header, 0, 100);
      const prefix = headerText(header, 345, 155);
      const archivePath = normalizeSkillSyncRelativePath(
        prefix ? `${prefix}/${name}` : name,
        archivePathOptions,
      );
      const target = resolveSkillSyncPathWithin(targetRoot, archivePath, archivePathOptions);
      if (typeFlag === "5") {
        await reader.skip(Math.ceil(size / blockSize) * blockSize);
        await mkdir(target, { recursive: true });
        continue;
      }
      if (typeFlag !== "0" && typeFlag !== "\0") {
        throw new Error(`unsupported skill archive entry type: ${typeFlag}`);
      }
      const nextExtractedBytes = extractedBytes + size;
      if (
        !Number.isSafeInteger(nextExtractedBytes) ||
        (maxExtractedBytes !== undefined && nextExtractedBytes > maxExtractedBytes)
      ) {
        throw createSkillSyncSizeLimitError({
          actualBytes: nextExtractedBytes,
          maxBytes: maxExtractedBytes ?? Number.MAX_SAFE_INTEGER,
          phase: "extracted-content",
        });
      }
      const content = await reader.readExact(size);
      if (content === null) throw new Error("truncated skill sync archive entry");
      await reader.skip((blockSize - (size % blockSize)) % blockSize);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
      extractedBytes = nextExtractedBytes;
    }
  } finally {
    input.destroy();
    gunzip.destroy();
  }
}
