// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import { installClock, ManualClock } from "./clock.ts";
import { loadCandidate } from "./bundle.ts";
import { createLogger, installSeams, retainedExports, SeamController } from "./seams.ts";
import type { CandidateExports, LoggerLike, McpPortLike, UnknownRecord } from "./types.ts";

export class FakeStderr {
  readonly listeners: Array<(chunk: unknown) => void> = [];

  emit(chunk: unknown): void {
    for (const listener of this.listeners) listener(chunk);
  }

  on(event: string, listener: (chunk: unknown) => void): this {
    assert.equal(event, "data");
    this.listeners.push(listener);
    return this;
  }
}

export interface Rig {
  adapter(options?: UnknownRecord): McpPortLike;
  candidate: CandidateExports;
  clock: ManualClock;
  logger: LoggerLike;
  retained: Record<string, unknown>;
  seams: SeamController;
  stderr: FakeStderr;
}

function installDefaults(seams: SeamController, stderr: FakeStderr): void {
  seams.setValue("stdio.stderr", stderr);
  seams.setValue("uuid", "00000000-0000-4000-8000-000000000001");
  seams.setHook("sdk.client.connect", async () => undefined);
  seams.setHook("sdk.client.listTools", async () => ({ tools: [] }));
  seams.setHook("sdk.client.callTool", async () => ({ content: [] }));
  seams.setHook("sdk.client.ping", async () => ({}));
  seams.setHook("sdk.client.close", async () => undefined);
  seams.setHook("sdk.transport.close", async () => undefined);
  seams.setHook("processTree.terminate", async () => undefined);
}

export async function withRig(run: (rig: Rig) => Promise<void> | void): Promise<void> {
  const seams = new SeamController();
  const stderr = new FakeStderr();
  const clock = new ManualClock();
  installDefaults(seams, stderr);
  const restoreSeams = installSeams(seams);
  const restoreClock = installClock(clock);
  try {
    const candidate = await loadCandidate();
    const logger = createLogger(seams);
    await run({
      adapter: (options = {}) => candidate.createMcpAdapter({ logger, ...options }),
      candidate,
      clock,
      logger,
      retained: retainedExports(),
      seams,
      stderr,
    });
  } finally {
    restoreClock();
    restoreSeams();
  }
}

export function httpConfig(overrides: UnknownRecord = {}): UnknownRecord {
  return { type: "http", url: "https://mcp.example.test/rpc", ...overrides };
}

export function sseConfig(overrides: UnknownRecord = {}): UnknownRecord {
  return { type: "sse", url: "https://mcp.example.test/events", ...overrides };
}

export function stdioConfig(overrides: UnknownRecord = {}): UnknownRecord {
  return { command: "fixture-mcp", type: "stdio", ...overrides };
}

export async function connectHttp(
  rig: Rig,
  overrides: UnknownRecord = {},
  options?: UnknownRecord,
): Promise<McpPortLike> {
  const adapter = rig.adapter();
  const status = await adapter.connectServer("alpha", httpConfig(overrides), options);
  assert.equal(status.status, "connected");
  return adapter;
}

export function objectArg(callArgs: unknown[], index: number): UnknownRecord {
  const value = callArgs[index];
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as UnknownRecord;
}

export function instanceAt(rig: Rig, key: string, index = 0): UnknownRecord {
  const receiver = rig.seams.call(key, index).receiver;
  assert.ok(receiver && typeof receiver === "object");
  return receiver as UnknownRecord;
}
