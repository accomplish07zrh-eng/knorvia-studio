// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export interface NodeReplImage {
  base64: string;
  mimeType: string;
}
export interface NodeReplStructuredResult {
  content: Array<{ type: string; [key: string]: unknown }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}
export interface NodeReplCuaAppIdentity {
  appKey: string;
  displayName?: string;
}
export interface NodeReplWriteSink {
  write(text: string): void;
  images: NodeReplImage[];
  browserScreenshots: NodeReplImage[];
  structuredResults: NodeReplStructuredResult[];
  responseMeta: Record<string, unknown>;
  cuaApps: NodeReplCuaAppIdentity[];
}
export interface NodeReplRunResult {
  result?: string;
  logs: string;
  error?: { name: string; message: string; stack?: string };
  images?: NodeReplImage[];
  browserScreenshotImageIndices?: number[];
  structuredResults?: NodeReplStructuredResult[];
  responseMeta?: Record<string, unknown>;
  cuaApp?: NodeReplCuaAppIdentity;
}
export type NodeReplRequestMeta = Record<string, unknown>;
export interface NodeReplSessionOptions {
  injectedGlobals?: Record<PropertyKey, unknown> | (() => Record<PropertyKey, unknown>);
  restrictProcess?: boolean;
}
export interface RunOptions {
  signal?: AbortSignal;
  requestMeta?: NodeReplRequestMeta;
  syncTimeoutMs?: number;
}
