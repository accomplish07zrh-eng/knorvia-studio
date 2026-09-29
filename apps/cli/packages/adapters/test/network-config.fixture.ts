// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { TestContext } from "node:test";
type Module = typeof import("../src/network/http-config.js");
export const target = new URL("../src/network/http-config.js", import.meta.url).href;
export const api = (await import(target)) as Module;
export const url = "https://target.invalid/resource";
export const proxy = "http://proxy.invalid:8080/";
export const absent = { noProxyMatched: false };
export const bypass = { noProxyMatched: true };
export function selected(proxySource = "network.httpProxy", proxyUrl = proxy) {
  return { noProxyMatched: false, proxySource, proxyUrl };
}
export function captured(values: Record<string, unknown>): Record<string, string> {
  return { KNORVIA_TOOL_ENV_PASSTHROUGH_JSON: JSON.stringify(values) };
}
export function thrown(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  assert.fail("operation must throw synchronously");
}
export function ambient(t: TestContext, key: string, value: string): void {
  const before = process.env[key];
  process.env[key] = value;
  t.after(() => {
    if (before === undefined) delete process.env[key];
    else process.env[key] = before;
  });
}
export async function directory(t: TestContext): Promise<string> {
  const base = resolve(tmpdir());
  const path = await mkdtemp(join(base, "knorvia-network-config-test-"));
  t.after(async () => {
    const inside = relative(base, resolve(path));
    assert.ok(
      inside.startsWith("knorvia-network-config-test-") &&
        !inside.startsWith("..") &&
        !isAbsolute(inside),
    );
    await rm(path, { recursive: true, force: true });
  });
  return path;
}
