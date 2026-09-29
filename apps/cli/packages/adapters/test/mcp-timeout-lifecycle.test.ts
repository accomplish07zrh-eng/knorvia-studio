// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

// 独立原生进程观察未处理拒绝，并以自然退出验证长定时器已释放。
for (const mode of [
  "pre-aborted-rejected",
  "pre-aborted-late",
  "expired-rejected",
  "expired-late",
  "pending-cancel-late",
  "timed-out-late",
  "settled-resources",
] as const) {
  test(`MCP native waiter lifecycle: ${mode}`, () => {
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(new URL("./mcp-timeout-child.fixture.ts", import.meta.url)),
        mode,
      ],
      { encoding: "utf8", windowsHide: true, timeout: 10_000 },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.signal, null);
    assert.equal(child.status, 0, child.stderr);
    const receipt = JSON.parse(child.stdout.trim()) as {
      mode: string;
      synchronous: boolean;
      unhandled: number;
      abortListeners: number;
      timerDelta: number;
    };
    assert.equal(receipt.mode, mode);
    assert.equal(receipt.synchronous, mode.startsWith("expired"));
    assert.equal(receipt.abortListeners, 0);
    assert.equal(receipt.timerDelta, 0);
    assert.equal(
      receipt.unhandled,
      0,
      "borrowed source rejection must remain observed on every exit",
    );
  });
}
