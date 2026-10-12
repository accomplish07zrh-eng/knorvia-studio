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
const DATA_URL_PREFIX = "data:";
const BASE64_ENCODING = "base64";

type MediaTarget = NonNullable<ReturnType<typeof mediaTarget>>;

/** 目标是否已是常规文件：按原生 code 判缺失，保留非 Error 值的访问边界。 */
async function isExistingFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return false;
    throw error;
  }
}

/** 临时文件名：同目录下的 `.tmp-<uuid>`，rename 落定前不影响读者。 */
function stagingPath(target: string): string {
  return `${target}.tmp-${randomUUID()}`;
}

/** 写入临时文件后 rename；失败时清理临时文件，但保留写入的首因。 */
async function publishAtomic(target: MediaTarget, bytes: Buffer): Promise<void> {
  const directory = dirname(target.path);
  const temporary = stagingPath(target.path);
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
}

export async function publishMedia(
  roots: ArtifactRoots,
  uri: string,
  mediaType: string,
  bytes: Buffer,
): Promise<MediaAttachmentPathResult> {
  const target = mediaTarget(roots, uri, mediaType);
  if (!target) return { status: "unsupported" };
  if (await isExistingFile(target.path)) return { status: "ready", path: target.path };
  await publishAtomic(target, bytes);
  return { status: "ready", path: target.path };
}

/** 拆 data URL：返回 base64 载荷与头部声明；头部必须是 `data:<mime>;base64`。 */
function splitDataUrl(content: string): { payload: string; semicolonHeader: string[] } {
  const comma = content.indexOf(",");
  const header = content.slice(0, comma).split(";");
  return { payload: content.slice(comma + 1), semicolonHeader: header };
}

function decodeDataUrl(
  content: string,
  kind: MediaKind,
  uri: string,
): { bytes: Buffer; mediaType: string } {
  const comma = content.indexOf(",");
  const { payload, semicolonHeader } = splitDataUrl(content);
  const mediaType = semicolonHeader[0]!.slice(DATA_URL_PREFIX.length).trim();
  const encoding = semicolonHeader.at(-1)!.trim().toLowerCase();
  const declaredKind = mediaKind(mediaType);
  if (
    !/^data:/i.test(content) ||
    comma < 0 ||
    declaredKind !== kind ||
    encoding !== BASE64_ENCODING
  ) {
    throw new Error(`Media attachment artifact is not a base64 ${kind} data URL: ${uri}`);
  }
  const bytes = Buffer.from(payload, BASE64_ENCODING);
  if (bytes.length === 0) throw new Error(`Media attachment artifact is empty: ${uri}`);
  const signature = bytes.subarray(0, PDF_SIGNATURE.length);
  if (kind === "pdf" && !signature.equals(PDF_SIGNATURE)) {
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
  if (await isExistingFile(requested.path)) return { status: "ready", path: requested.path };
  const backing = await read(uri);
  const decoded = decodeDataUrl(backing.content, requested.kind, uri);
  return publishMedia(roots, uri, decoded.mediaType, decoded.bytes);
}
