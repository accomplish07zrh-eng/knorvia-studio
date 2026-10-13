// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 工件读写：写入落盘为 `<session>/<sanitized callId>-<artifact id><扩展名>`，
// 读取按 uri 中的 artifactId 在会话目录内按名匹配。

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createArtifactUri } from "@knorvia/shared";
import type {
  ToolArtifactReadRequest,
  ToolArtifactReadResult,
  ToolArtifactStatRequest,
  ToolArtifactStatResult,
  ToolArtifactWriteRequest,
  ToolArtifactWriteResult,
  ToolBinaryArtifactReadResult,
  ToolBinaryArtifactWriteRequest,
} from "@knorvia/contracts";
import { maybeThrowStorageFsFault } from "./fs-fault-injection.js";
import {
  binaryExtension,
  inferredType,
  parseArtifactUri,
  sanitizeComponent,
  sessionComponent,
  textExtension,
} from "./artifact-policy.js";

const ARTIFACT_ID_PREFIX = "tool-result-";
const DEFAULT_CONTENT_TYPE = "application/json";
const JSON_TYPE = "application/json";
const TEXT_TYPE_PREFIX = "text/";
const JSON_ENCODING = "utf8" as const;
const BINARY_ENCODING = "base64" as const;

function throwIfCancelled(signal: AbortSignal | undefined, message: string): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error(message);
}

/** 先建目录再写内容：两步各自可被故障注入命中。 */
async function persist(directory: string, path: string, content: string | Buffer): Promise<void> {
  maybeThrowStorageFsFault({ operation: "mkdir", path: directory });
  await mkdir(directory, { recursive: true });
  maybeThrowStorageFsFault({ operation: "writeFile", path });
  await writeFile(path, content, typeof content === "string" ? JSON_ENCODING : undefined);
}

interface ReceiptInput {
  bytes: number;
  contentType: string;
  id: string;
  path: string;
  sessionId: string;
}

function receipt(input: ReceiptInput): ToolArtifactWriteResult {
  const result = {} as ToolArtifactWriteResult;
  result.id = input.id;
  result.uri = createArtifactUri(input.sessionId, input.id);
  result.path = input.path;
  result.bytes = input.bytes;
  result.contentType = input.contentType;
  result.createdAt = new Date();
  return result;
}

function newArtifactId(): string {
  return `${ARTIFACT_ID_PREFIX}${globalThis.crypto.randomUUID()}`;
}

/** 存放位置：会话目录 + `<净化后的 callId>-<id><扩展名>`。 */
function placement(
  root: string,
  sessionId: string,
  callId: string,
  id: string,
  extension: string,
): {
  directory: string;
  path: string;
} {
  const directory = join(root, sessionComponent(sessionId));
  return { directory, path: join(directory, `${sanitizeComponent(callId)}-${id}${extension}`) };
}

export async function writeText(
  root: string,
  request: ToolArtifactWriteRequest,
  signal?: AbortSignal,
): Promise<ToolArtifactWriteResult> {
  throwIfCancelled(signal, "Tool artifact write cancelled");
  const id = newArtifactId();
  // mkdir 等待期间请求可被调用方修改；所有持久事实使用同一份调用时快照。
  const sessionId = request.sessionId;
  const callId = String(request.toolCallId);
  const content = request.content;
  const contentType = request.contentType ?? DEFAULT_CONTENT_TYPE;
  const location = placement(root, sessionId, callId, id, textExtension(contentType));
  await persist(location.directory, location.path, content);
  return receipt({
    bytes: Buffer.byteLength(content, JSON_ENCODING),
    contentType,
    id,
    path: location.path,
    sessionId,
  });
}

export async function writeBinary(
  root: string,
  request: ToolBinaryArtifactWriteRequest,
  signal?: AbortSignal,
): Promise<ToolArtifactWriteResult> {
  throwIfCancelled(signal, "Tool binary artifact write cancelled");
  const id = newArtifactId();
  const sessionId = request.sessionId;
  const callId = String(request.toolCallId);
  const contentType = request.contentType;
  const extension = binaryExtension(contentType, request.extension);
  const location = placement(root, sessionId, callId, id, extension);
  const content = Buffer.from(request.content);
  await persist(location.directory, location.path, content);
  return receipt({
    bytes: content.length,
    contentType,
    id,
    path: location.path,
    sessionId,
  });
}

/** 在会话目录内按 artifactId 子串匹配文件名；找不到时抛错而不是回退到别的文件。 */
async function locate(root: string, uri: string): Promise<string> {
  const parsed = parseArtifactUri(uri);
  const directory = join(root, sessionComponent(parsed.sessionId));
  const entries = await readdir(directory);
  const selected = entries.find((name) => name.includes(parsed.artifactId));
  if (selected === undefined) throw new Error(`Tool artifact not found: ${uri}`);
  return join(directory, selected);
}

function textEncodingFor(contentType: string): BufferEncoding {
  const textual = contentType === JSON_TYPE || contentType.startsWith(TEXT_TYPE_PREFIX);
  return textual ? JSON_ENCODING : BINARY_ENCODING;
}

export async function readText(
  root: string,
  request: ToolArtifactReadRequest,
  signal?: AbortSignal,
): Promise<ToolArtifactReadResult> {
  throwIfCancelled(signal, "Tool artifact read cancelled");
  const uri = request.uri;
  const path = await locate(root, uri);
  const raw = await readFile(path);
  const contentType = inferredType(path);
  const result = {} as ToolArtifactReadResult;
  result.uri = uri;
  result.content = raw.toString(textEncodingFor(contentType));
  result.contentType = contentType;
  result.bytes = raw.length;
  result.path = path;
  return result;
}

export async function readBinary(
  root: string,
  request: ToolArtifactReadRequest,
  signal?: AbortSignal,
): Promise<ToolBinaryArtifactReadResult> {
  throwIfCancelled(signal, "Tool artifact read cancelled");
  const uri = request.uri;
  const path = await locate(root, uri);
  const raw = await readFile(path);
  const result = {} as ToolBinaryArtifactReadResult;
  result.uri = uri;
  result.bytes = new Uint8Array(raw);
  result.contentType = inferredType(path);
  result.path = path;
  return result;
}

export async function inspectArtifact(
  root: string,
  request: ToolArtifactStatRequest,
  signal?: AbortSignal,
): Promise<ToolArtifactStatResult> {
  throwIfCancelled(signal, "Tool artifact stat cancelled");
  const uri = request.uri;
  const path = await locate(root, uri);
  const observed = await stat(path);
  const result = {} as ToolArtifactStatResult;
  result.uri = uri;
  result.bytes = observed.size;
  result.contentType = inferredType(path);
  result.path = path;
  result.mtimeMs = observed.mtimeMs;
  return result;
}
