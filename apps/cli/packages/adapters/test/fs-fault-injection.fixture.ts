// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import type { TestContext } from "node:test";

export type FaultModule = typeof import("../src/storage/fs-fault-injection.js");
export type Operation = Parameters<FaultModule["maybeThrowStorageFsFault"]>[0]["operation"];
const keys = ["KNORVIA_ENV", "KNORVIA_E2E_FS_FAULTS", "KNORVIA_E2E_FS_FAULTS_ALLOW"] as const;
const moduleUrl = new URL("../src/storage/fs-fault-injection.js", import.meta.url);
let instance = 0;

export function environment(t: TestContext, raw?: string, mode?: string, allow?: string) {
  const saved = keys.map((key) => [key, process.env[key]] as const);
  t.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const values = [mode, raw, allow];
  keys.forEach((key, index) => {
    const value = values[index];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}

export async function fresh(): Promise<FaultModule> {
  const target = new URL(moduleUrl);
  target.searchParams.set("faultTestInstance", String(++instance));
  return import(target.href) as Promise<FaultModule>;
}

export function rule(extra: Record<string, unknown> = {}) {
  return { id: "fixture-rule", code: "EACCES", ...extra };
}

export function check(port: FaultModule, operation: Operation = "writeFile", path = "fixture/one") {
  return port.maybeThrowStorageFsFault({ operation, path });
}

export function errorOf(action: () => unknown): Error & Record<string, unknown> {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error as Error & Record<string, unknown>;
  }
  assert.fail("Expected the public fault port to throw");
}

export function messageOf(action: () => unknown) {
  return errorOf(action).message;
}
