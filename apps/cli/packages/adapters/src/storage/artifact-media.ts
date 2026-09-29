// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { randomUUID } from "node:crypto";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { MediaAttachmentPathResult, ToolArtifactReadResult } from "@knorvia/contracts";
import { maybeThrowStorageFsFault } from "./fs-fault-injection.js";
import { mediaKind, mediaTarget } from "./artifact-policy.js";
import type { ArtifactRoots, MediaKind } from "./artifact-policy.js";

const PDF_SIGNATURE = Buffer.from("%PDF-");

async function regularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    // 原端口按 code 属性判缺失，保留非 Error 值及 null 的原生访问边界。
    if ((error as { code?: unknown }).code === "ENOENT") return false;
    throw error;
  }
}

export async function publishMedia(
  roots: ArtifactRoots,
  uri: string,
  mediaType: string,
  bytes: Buffer,
): Promise<MediaAttachmentPathResult> {
  const target = mediaTarget(roots, uri, mediaType);
  if (!target) return { status: "unsupported" };
  if (await regularFile(target.path)) return { status: "ready", path: target.path };
  const temporary = `${target.path}.tmp-${randomUUID()}`;
  const directory = dirname(target.path);
  maybeThrowStorageFsFault({ operation: "mkdir", path: directory });
  await mkdir(directory, { recursive: true });
  try {
    maybeThrowStorageFsFault({ operation: "writeFile", path: temporary });
    await writeFile(temporary, bytes);
    maybeThrowStorageFsFault({ operation: "rename", path: target.path });
    await rename(temporary, target.path);
  } catch (error) {
    try {
      await unlink(temporary);
    } catch {
      /* 清理失败不能覆盖写入首因。 */
    }
    throw error;
  }
  return { status: "ready", path: target.path };
}

function decodeDataUrl(
  content: string,
  kind: MediaKind,
  uri: string,
): { bytes: Buffer; mediaType: string } {
  const comma = content.indexOf(",");
  const header = content.slice(0, comma).split(";");
  const mediaType = header[0]!.slice("data:".length).trim();
  const encoding = header.at(-1)!.trim().toLowerCase();
  if (
    !/^data:/i.test(content) ||
    comma < 0 ||
    mediaKind(mediaType) !== kind ||
    encoding !== "base64"
  ) {
    throw new Error(`Media attachment artifact is not a base64 ${kind} data URL: ${uri}`);
  }
  const bytes = Buffer.from(content.slice(comma + 1), "base64");
  if (bytes.length === 0) throw new Error(`Media attachment artifact is empty: ${uri}`);
  if (kind === "pdf" && !bytes.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
    throw new Error(`Media attachment artifact is not a PDF: ${uri}`);
  }
  return { bytes, mediaType };
}

export async function ensureMedia(
  roots: ArtifactRoots,
  uri: string,
  mediaType: string,
  read: (uri: string) => Promise<ToolArtifactReadResult>,
): Promise<MediaAttachmentPathResult> {
  const requested = mediaTarget(roots, uri, mediaType);
  if (!requested) return { status: "unsupported" };
  if (await regularFile(requested.path)) return { status: "ready", path: requested.path };
  const backing = await read(uri);
  const decoded = decodeDataUrl(backing.content, requested.kind, uri);
  return publishMedia(roots, uri, decoded.mediaType, decoded.bytes);
}
