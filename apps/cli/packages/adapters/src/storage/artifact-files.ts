// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

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

function checkAbort(signal: AbortSignal | undefined, message: string): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error(message);
}

async function persist(directory: string, path: string, content: string | Buffer): Promise<void> {
  maybeThrowStorageFsFault({ operation: "mkdir", path: directory });
  await mkdir(directory, { recursive: true });
  maybeThrowStorageFsFault({ operation: "writeFile", path });
  await writeFile(path, content, typeof content === "string" ? "utf8" : undefined);
}

function receipt(
  id: string,
  sessionId: string,
  path: string,
  bytes: number,
  contentType: string,
): ToolArtifactWriteResult {
  return {
    id,
    uri: createArtifactUri(sessionId, id),
    path,
    bytes,
    contentType,
    createdAt: new Date(),
  };
}

export async function writeText(
  root: string,
  request: ToolArtifactWriteRequest,
  signal?: AbortSignal,
): Promise<ToolArtifactWriteResult> {
  checkAbort(signal, "Tool artifact write cancelled");
  const id = `tool-result-${globalThis.crypto.randomUUID()}`;
  // mkdir 等待期间请求可被调用方修改；所有持久事实使用同一份调用时快照。
  const sessionId = request.sessionId;
  const callId = String(request.toolCallId);
  const content = request.content;
  const contentType = request.contentType ?? "application/json";
  const extension = textExtension(contentType);
  const directory = join(root, sessionComponent(sessionId));
  const path = join(directory, `${sanitizeComponent(callId)}-${id}${extension}`);
  await persist(directory, path, content);
  return receipt(id, sessionId, path, Buffer.byteLength(content, "utf8"), contentType);
}

export async function writeBinary(
  root: string,
  request: ToolBinaryArtifactWriteRequest,
  signal?: AbortSignal,
): Promise<ToolArtifactWriteResult> {
  checkAbort(signal, "Tool binary artifact write cancelled");
  const id = `tool-result-${globalThis.crypto.randomUUID()}`;
  const sessionId = request.sessionId;
  const callId = String(request.toolCallId);
  const contentType = request.contentType;
  const extension = binaryExtension(contentType, request.extension);
  const directory = join(root, sessionComponent(sessionId));
  const path = join(directory, `${sanitizeComponent(callId)}-${id}${extension}`);
  const content = Buffer.from(request.content);
  await persist(directory, path, content);
  return receipt(id, sessionId, path, content.length, contentType);
}

async function locate(root: string, uri: string): Promise<string> {
  const parsed = parseArtifactUri(uri);
  const directory = join(root, sessionComponent(parsed.sessionId));
  const entries = await readdir(directory);
  const selected = entries.find((name) => name.includes(parsed.artifactId));
  if (selected === undefined) throw new Error(`Tool artifact not found: ${uri}`);
  return join(directory, selected);
}

export async function readText(
  root: string,
  request: ToolArtifactReadRequest,
  signal?: AbortSignal,
): Promise<ToolArtifactReadResult> {
  checkAbort(signal, "Tool artifact read cancelled");
  const uri = request.uri;
  const path = await locate(root, uri);
  const raw = await readFile(path);
  const contentType = inferredType(path);
  const encoding =
    contentType === "application/json" || contentType.startsWith("text/") ? "utf8" : "base64";
  return { uri, content: raw.toString(encoding), contentType, bytes: raw.length, path };
}

export async function readBinary(
  root: string,
  request: ToolArtifactReadRequest,
  signal?: AbortSignal,
): Promise<ToolBinaryArtifactReadResult> {
  checkAbort(signal, "Tool artifact read cancelled");
  const uri = request.uri;
  const path = await locate(root, uri);
  const raw = await readFile(path);
  return { uri, bytes: new Uint8Array(raw), contentType: inferredType(path), path };
}

export async function inspectArtifact(
  root: string,
  request: ToolArtifactStatRequest,
  signal?: AbortSignal,
): Promise<ToolArtifactStatResult> {
  checkAbort(signal, "Tool artifact stat cancelled");
  const uri = request.uri;
  const path = await locate(root, uri);
  const observed = await stat(path);
  return {
    uri,
    bytes: observed.size,
    contentType: inferredType(path),
    path,
    mtimeMs: observed.mtimeMs,
  };
}
