import { constants, type BigIntStats } from "node:fs";
import { lstat, open, type FileHandle } from "node:fs/promises";

import {
  PROJECT_MEMORY_FILE_CHANGED_ERROR_CODE,
  PROJECT_MEMORY_PREVIEW_LIMIT_EXCEEDED_ERROR_CODE,
} from "#src/memory/memory.js";

const PREVIEW_LIMIT_BYTES = 5242880;

function sameSnapshot(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function changedFileError(fileName: string): Error {
  return Object.assign(new Error(`Project Memory file changed during preview: ${fileName}`), {
    code: PROJECT_MEMORY_FILE_CHANGED_ERROR_CODE,
  });
}

function previewLimitError(fileName: string): Error {
  return Object.assign(
    new Error(`Project Memory file exceeds the 5 MiB preview limit: ${fileName}`),
    { code: PROJECT_MEMORY_PREVIEW_LIMIT_EXCEEDED_ERROR_CODE },
  );
}

async function readBounded(handle: FileHandle): Promise<Buffer> {
  const buffer = Buffer.alloc(PREVIEW_LIMIT_BYTES + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return buffer.subarray(0, offset);
}

export async function readProjectMemoryFileFromStableHandle(params: {
  fileName: string;
  filePath: string;
  validatePath: () => Promise<void>;
}): Promise<{ content: string; updatedAt: number }> {
  const beforeOpen = await lstat(params.filePath, { bigint: true });
  if (!beforeOpen.isFile() || beforeOpen.isSymbolicLink()) {
    throw new Error(`Project Memory file is not a regular file: ${params.filePath}`);
  }

  const flags =
    constants.O_RDONLY | (typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0);
  const handle = await open(params.filePath, flags);
  try {
    const opened = await handle.stat({ bigint: true });
    await params.validatePath();
    const afterOpen = await lstat(params.filePath, { bigint: true });
    if (
      !opened.isFile() ||
      !afterOpen.isFile() ||
      afterOpen.isSymbolicLink() ||
      !sameSnapshot(opened, beforeOpen) ||
      !sameSnapshot(opened, afterOpen)
    ) {
      throw changedFileError(params.fileName);
    }
    if (opened.size > BigInt(PREVIEW_LIMIT_BYTES)) {
      throw previewLimitError(params.fileName);
    }

    const content = await readBounded(handle);
    const final = await handle.stat({ bigint: true });
    if (!sameSnapshot(opened, final)) {
      throw changedFileError(params.fileName);
    }
    if (content.length > PREVIEW_LIMIT_BYTES || final.size > BigInt(PREVIEW_LIMIT_BYTES)) {
      throw previewLimitError(params.fileName);
    }
    return {
      content: content.toString("utf-8"),
      updatedAt: Number(final.mtimeNs) / 1000000,
    };
  } finally {
    await handle.close();
  }
}
