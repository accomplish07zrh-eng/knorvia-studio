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
async function publishAtomic(target: MediaTarget, encodedBytes: Buffer): Promise<void> {
  const directory = dirname(target.path);
  const temporary = stagingPath(target.path);
  maybeThrowStorageFsFault({ operation: "mkdir", path: directory });
  await mkdir(directory, { recursive: true });
  try {
    maybeThrowStorageFsFault({ operation: "writeFile", path: temporary });
    await writeFile(temporary, encodedBytes);
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
  artifactRoots: ArtifactRoots,
  sourceUri: string,
  declaredType: string,
  encodedBytes: Buffer,
): Promise<MediaAttachmentPathResult> {
  const target = mediaTarget(artifactRoots, sourceUri, declaredType);
  if (!target) return { status: "unsupported" };
  if (await isExistingFile(target.path)) return { status: "ready", path: target.path };
  await publishAtomic(target, encodedBytes);
  return { status: "ready", path: target.path };
}

/** 拆 data URL：返回 base64 载荷与头部声明；头部必须是 `data:<mime>;base64`。 */
function splitDataUrl(text: string): { base64Body: string; semicolonHeader: string[] } {
  const separator = text.indexOf(",");
  const segments = text.slice(0, separator).split(";");
  return { base64Body: text.slice(separator + 1), semicolonHeader: segments };
}

function decodeDataUrl(
  text: string,
  mediaClass: MediaKind,
  sourceUri: string,
): { encodedBytes: Buffer; declaredType: string } {
  const separator = text.indexOf(",");
  const { base64Body, semicolonHeader } = splitDataUrl(text);
  const declaredType = semicolonHeader[0]!.slice(DATA_URL_PREFIX.length).trim();
  const encoding = semicolonHeader.at(-1)!.trim().toLowerCase();
  const declaredKind = mediaKind(declaredType);
  if (
    !/^data:/i.test(text) ||
    separator < 0 ||
    declaredKind !== mediaClass ||
    encoding !== BASE64_ENCODING
  ) {
    throw new Error(
      `Media attachment artifact is not a base64 ${mediaClass} data URL: ${sourceUri}`,
    );
  }
  const encodedBytes = Buffer.from(base64Body, BASE64_ENCODING);
  if (encodedBytes.length === 0)
    throw new Error(`Media attachment artifact is empty: ${sourceUri}`);
  const signature = encodedBytes.subarray(0, PDF_SIGNATURE.length);
  if (mediaClass === "pdf" && !signature.equals(PDF_SIGNATURE)) {
    throw new Error(`Media attachment artifact is not a PDF: ${sourceUri}`);
  }
  return { encodedBytes, declaredType };
}

export async function ensureMedia(
  artifactRoots: ArtifactRoots,
  sourceUri: string,
  declaredType: string,
  loader: (sourceUri: string) => Promise<ToolArtifactReadResult>,
): Promise<MediaAttachmentPathResult> {
  const requested = mediaTarget(artifactRoots, sourceUri, declaredType);
  if (!requested) return { status: "unsupported" };
  if (await isExistingFile(requested.path)) return { status: "ready", path: requested.path };
  const backing = await loader(sourceUri);
  const decoded = decodeDataUrl(backing.content, requested.kind, sourceUri);
  return publishMedia(artifactRoots, sourceUri, decoded.declaredType, decoded.encodedBytes);
}
