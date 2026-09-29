// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
type Module = typeof import("../src/network/subprocess-env.js");
export const target = new URL("../src/network/subprocess-env.js", import.meta.url).href;
export const api = (await import(target)) as Module;
export const captureKey = "KNORVIA_TOOL_ENV_PASSTHROUGH_JSON";
export const platforms = ["linux", "win32", "darwin"] as const;
export const proxyKeys = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
];
export const caKeys = [
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "GIT_SSL_CAINFO",
];
export function expectKeys(env: Record<string, string>, keys: string[], value: string) {
  assert.deepEqual(Object.keys(env), keys);
  for (const key of keys) assert.equal(env[key], value);
}
export function proxyOutputs(platform: NodeJS.Platform) {
  return platform === "win32" ? ["http_proxy", "https_proxy", "all_proxy"] : proxyKeys;
}
