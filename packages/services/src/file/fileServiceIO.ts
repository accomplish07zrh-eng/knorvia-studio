import type { Dirent } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { getMediaPreviewFormat } from "@knorvia/shared";
import type {
  FileBinaryPreview,
  FileEntry,
  FileMediaPreview,
  FileTextSlice,
} from "@knorvia/shared";

function boundedBytes(value: number | undefined, fallback: number, maximum: number): number {
  const whole = Number.isFinite(value) ? Math.trunc(value ?? fallback) : fallback;
  return Math.min(Math.max(whole, 1), maximum);
}

function hasBinaryBytes(bytes: Buffer): boolean {
  if (bytes.length === 0) return false;
  let controls = 0;
  for (const byte of bytes) {
    if (byte === 0) return true;
    if ((byte >= 1 && byte <= 8) || (byte >= 14 && byte <= 31) || byte === 127) {
      controls += 1;
    }
  }
  return controls / bytes.length > 0.3;
}

function previewMediaType(path: string): string {
  const imageTypes: Record<string, string> = {
    ".apng": "image/apng",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  return (
    imageTypes[extname(path).toLowerCase()] ??
    getMediaPreviewFormat(path)?.mediaType ??
    "application/octet-stream"
  );
}

export async function classifyFileEntry(path: string, entry: Dirent): Promise<FileEntry["type"]> {
  const directory = entry.isDirectory();
  const symbolic = entry.isSymbolicLink();
  if (directory) return "directory";
  if (!symbolic) return "file";
  try {
    return (await stat(path)).isDirectory() ? "directory" : "file";
  } catch {
    return "file";
  }
}

export async function readTextSlice(params: {
  path: string;
  offset?: number;
  length?: number;
}): Promise<FileTextSlice> {
  const metadata = await stat(params.path);
  if (!metadata.isFile()) throw new Error(`Path is not a file: ${params.path}`);
  const offset = Math.max(0, Math.trunc(params.offset ?? 0));
  if (offset >= metadata.size) {
    return {
      path: params.path,
      content: "",
      offset,
      bytesRead: 0,
      totalBytes: metadata.size,
      truncated: false,
      isBinary: false,
    };
  }
  const length = Math.min(boundedBytes(params.length, 131072, 262144), metadata.size - offset);
  const handle = await open(params.path, "r");
  try {
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    const bytes = buffer.subarray(0, bytesRead);
    const isBinary = hasBinaryBytes(bytes);
    return {
      path: params.path,
      content: isBinary ? "" : bytes.toString("utf-8"),
      offset,
      bytesRead,
      totalBytes: metadata.size,
      truncated: offset + bytesRead < metadata.size,
      isBinary,
    };
  } finally {
    await handle.close();
  }
}

export async function readByteRange(params: {
  path: string;
  offset: number;
  length: number;
}): Promise<Uint8Array> {
  const metadata = await stat(params.path);
  if (!metadata.isFile()) throw new Error(`Path is not a file: ${params.path}`);
  const offset = Math.max(0, Math.trunc(params.offset));
  if (offset >= metadata.size) return new Uint8Array(0);
  const length = Math.min(boundedBytes(params.length, 262144, 1048576), metadata.size - offset);
  const handle = await open(params.path, "r");
  try {
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    return new Uint8Array(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

export async function readMediaFilePreview(params: {
  path: string;
  maxBytes?: number;
}): Promise<FileMediaPreview> {
  const metadata = await stat(params.path);
  if (!metadata.isFile()) throw new Error(`Path is not a file: ${params.path}`);
  const maximum = boundedBytes(params.maxBytes, 4194304, 8388608);
  if (metadata.size > maximum) throw new Error(`File is too large to preview: ${params.path}`);
  const bytes = await readFile(params.path);
  return {
    path: params.path,
    mediaType: previewMediaType(params.path),
    dataBase64: bytes.toString("base64"),
    totalBytes: metadata.size,
  };
}

export async function readBinaryFilePreview(params: {
  path: string;
  maxBytes?: number;
}): Promise<FileBinaryPreview> {
  const metadata = await stat(params.path);
  if (!metadata.isFile()) throw new Error(`Path is not a file: ${params.path}`);
  const maximum = boundedBytes(params.maxBytes, 26214400, 26214400);
  if (metadata.size > maximum) throw new Error(`File is too large to preview: ${params.path}`);
  const bytes = await readFile(params.path);
  return { path: params.path, dataBase64: bytes.toString("base64"), totalBytes: metadata.size };
}
