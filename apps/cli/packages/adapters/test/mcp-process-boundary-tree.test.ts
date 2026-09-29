// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, rejected } from "./mcp-process-boundary.fixture.js";
import { commandResult } from "./mcp-process-boundary-system.fixture.js";

test("tree export has one required argument, dead roots do no work, and direct entry adds no PID validation", async () => {
  const h = await fixture();
  assert.deepEqual(Object.keys(h.tree), ["terminateMcpStdioProcessTree"]);
  assert.equal(h.tree.terminateMcpStdioProcessTree.length, 1);
  h.alive.clear();
  assert.equal(await h.tree.terminateMcpStdioProcessTree(42, h.ports), undefined);
  assert.equal(h.count("command"), 0);
  h.alive.add(-7);
  h.ports.platform = "win32";
  h.behavior.command = async () => commandResult();
  await h.tree.terminateMcpStdioProcessTree(-7, h.ports);
  assert.deepEqual(h.events("command")[0]?.slice(0, 2), ["taskkill", ["/PID", "-7", "/T", "/F"]]);
});

test("Windows successful command uses exact options and performs no post-command liveness check", async () => {
  for (const status of [0, null]) {
    const h = await fixture();
    h.ports.platform = "win32";
    h.behavior.command = async () => commandResult({ status });
    await h.tree.terminateMcpStdioProcessTree(42, h.ports);
    assert.deepEqual(h.events("command"), [
      [
        "taskkill",
        ["/PID", "42", "/T", "/F"],
        { encoding: "utf8", timeout: 2000, windowsHide: true },
      ],
    ]);
    assert.deepEqual(Object.keys(h.events("command")[0]?.[2] as object), [
      "encoding",
      "timeout",
      "windowsHide",
    ]);
    assert.deepEqual(h.events("kill"), [[42, 0]]);
  }
});

test("Windows fulfilled failure only rejects while root survives; command rejection is never retried", async () => {
  for (const [status, error] of [
    [2, undefined],
    [null, new Error("command")],
    [0, "error"],
  ] as const) {
    for (const survives of [true, false]) {
      const h = await fixture();
      h.ports.platform = "win32";
      h.behavior.command = async () => {
        if (!survives) h.alive.clear();
        return commandResult({ status, error });
      };
      const operation = h.tree.terminateMcpStdioProcessTree(42, h.ports);
      if (survives) {
        const failure = await rejected(operation);
        assert.ok(failure instanceof Error);
        assert.equal(
          failure.message,
          "taskkill failed for MCP stdio process tree pid=42 status=" + (status ?? "unknown"),
        );
      } else await operation;
      assert.equal(h.count("command"), 1);
      assert.equal(h.count("kill"), 2);
    }
  }
  const h = await fixture();
  h.ports.platform = "win32";
  const marker = new Error("exec rejection");
  h.behavior.command = async () => {
    throw marker;
  };
  assert.equal(await rejected(h.tree.terminateMcpStdioProcessTree(42, h.ports)), marker);
  assert.equal(h.count("kill"), 1);
});

test("default exec callback maps numeric and nonnumeric error codes without running a real command", async () => {
  for (const [error, expectedStatus] of [
    [null, null],
    [{ code: 3 }, "3"],
    [{ code: "ENOENT" }, "unknown"],
    [new Error("without code"), "0"],
    ["string error", "0"],
  ] as const) {
    const h = await fixture();
    h.processView.platform = "win32";
    h.behavior.nativeExec = (_file, _args, _options, callback) => {
      callback(error, "owned stdout", "owned stderr");
    };
    const operation = h.tree.terminateMcpStdioProcessTree(42);
    if (expectedStatus === null) await operation;
    else {
      const failure = await rejected(operation);
      assert.ok(failure instanceof Error);
      assert.equal(
        failure.message,
        "taskkill failed for MCP stdio process tree pid=42 status=" + expectedStatus,
      );
    }
    assert.equal(h.count("native.exec"), 1);
    assert.equal(h.count("command"), 0);
  }
  const h = await fixture();
  h.processView.platform = "win32";
  const marker = new Error("native exec threw synchronously");
  h.behavior.nativeExec = () => {
    throw marker;
  };
  assert.equal(await rejected(h.tree.terminateMcpStdioProcessTree(42)), marker);
});

test("POSIX recursion remains serial, deduplicates repeated descendants and signals children before root", async () => {
  const h = await fixture();
  h.alive.add(10).add(11).add(20);
  h.behavior.command = async (file, args, options) => {
    assert.equal(file, "pgrep");
    assert.deepEqual(options, { encoding: "utf8", timeout: 1000 });
    const children: Record<string, string> = {
      "42": "10 20 10 -2 0 3.5 invalid",
      "10": "11",
      "11": "\n",
      "20": "10",
    };
    return commandResult({ stdout: children[args[1] ?? ""] ?? "\n" });
  };
  h.behavior.signal = (pid, signal) => {
    if (signal === "SIGINT" && pid > 0) h.alive.delete(pid);
  };
  await h.tree.terminateMcpStdioProcessTree(42, h.ports);
  assert.deepEqual(
    h.events("command").map((event) => event[1]),
    [
      ["-P", "42"],
      ["-P", "10"],
      ["-P", "11"],
      ["-P", "20"],
    ],
  );
  assert.deepEqual(
    h.events("kill").filter((event) => event[1] !== 0),
    [
      [-42, "SIGINT"],
      [20, "SIGINT"],
      [11, "SIGINT"],
      [10, "SIGINT"],
      [42, "SIGINT"],
    ],
  );
  assert.equal(h.count("sleep"), 0);
});

test("pgrep fallback rereads platform, parses ps parent columns and does not fallback after truthy invalid pgrep text", async () => {
  const h = await fixture();
  h.alive.add(7).add(8);
  h.behavior.command = async (file, args) => {
    if (file === "pgrep" && args[1] === "42") {
      h.ports.platform = "darwin";
      return commandResult({ status: null });
    }
    if (file === "ps") {
      assert.deepEqual(args, ["-axo", "pid=,ppid="]);
      return commandResult({ stdout: "7 42 extra\r\n0x8 42\n1.5 42\n0 42\n9 13\n-1 42" });
    }
    return commandResult({ stdout: "invalid" });
  };
  h.behavior.signal = (pid, signal) => {
    if (signal === "SIGINT" && pid > 0) h.alive.delete(pid);
  };
  await h.tree.terminateMcpStdioProcessTree(42, h.ports);
  assert.deepEqual(
    h.events("command").map((event) => event[0]),
    ["pgrep", "ps", "pgrep", "pgrep"],
  );
  assert.deepEqual(
    h.events("kill").filter((event) => event[1] === "SIGINT"),
    [
      [-42, "SIGINT"],
      [8, "SIGINT"],
      [7, "SIGINT"],
      [42, "SIGINT"],
    ],
  );
});

test("escalation respects 250/750ms waits, refreshes descendants and skips dead PIDs before final kill", async () => {
  const h = await fixture();
  h.alive.add(10);
  let roots = 0;
  h.behavior.command = async (_file, args) => {
    if (args[1] === "42") {
      roots++;
      if (roots === 2) {
        h.alive.add(12);
        h.alive.delete(10);
      }
      return commandResult({ stdout: roots === 1 ? "10" : "12" });
    }
    return commandResult({ stdout: "\n" });
  };
  h.behavior.signal = (pid, signal) => {
    if (signal === "SIGKILL" && pid > 0) h.alive.delete(pid);
  };
  await h.tree.terminateMcpStdioProcessTree(42, h.ports);
  assert.equal(h.events("sleep").length, 40);
  assert.ok(h.events("sleep").every((entry) => entry[0] === 25));
  assert.deepEqual(
    h.events("kill").filter((event) => event[1] !== 0),
    [
      [-42, "SIGINT"],
      [10, "SIGINT"],
      [42, "SIGINT"],
      [-42, "SIGTERM"],
      [10, "SIGTERM"],
      [42, "SIGTERM"],
      [12, "SIGKILL"],
      [42, "SIGKILL"],
      [-42, "SIGKILL"],
    ],
  );
  assert.equal(roots, 2);
});

test("EPERM liveness and swallowed signal failures end in exact survivor diagnostics", async () => {
  const h = await fixture();
  h.ports.kill = function (pid, signal) {
    assert.equal(this, undefined);
    h.record("kill", pid, signal);
    if (signal === 0) throw Object.create({ code: "EPERM" });
    throw new Error("signal denied");
  };
  h.behavior.command = async () => commandResult({ stdout: "\n" });
  const error = await rejected(h.tree.terminateMcpStdioProcessTree(42, h.ports));
  assert.ok(error instanceof Error);
  assert.equal(error.message, "SIGKILL failed for MCP stdio process tree pid=42 remaining=42");
  assert.equal(h.count("sleep"), 50);
  assert.deepEqual(
    h.events("kill").filter((event) => event[1] === "SIGKILL"),
    [
      [42, "SIGKILL"],
      [-42, "SIGKILL"],
    ],
  );
});

test("command, clock and sleep failures propagate rather than being swallowed as signal failures", async () => {
  for (const phase of ["command", "clock", "sleep"] as const) {
    const h = await fixture();
    const marker = new Error(phase);
    h.behavior.command = async () => {
      if (phase === "command") throw marker;
      return commandResult({ stdout: "\n" });
    };
    if (phase === "clock")
      h.ports.now = () => {
        throw marker;
      };
    if (phase === "sleep")
      h.ports.sleep = async () => {
        throw marker;
      };
    assert.equal(await rejected(h.tree.terminateMcpStdioProcessTree(42, h.ports)), marker);
    if (phase === "command")
      assert.equal(h.events("kill").filter((entry) => entry[1] !== 0).length, 0);
  }
});

test("default POSIX sleep routes only through an owned 25ms timer", async () => {
  const h = await fixture();
  h.behavior.nativeExec = (_file, _args, _options, callback) => {
    callback(null, "invalid", "");
  };
  let probes = 0;
  h.behavior.signal = (_pid, signal) => {
    if (signal === 0 && ++probes === 2) h.alive.clear();
  };
  await h.tree.terminateMcpStdioProcessTree(42);
  assert.deepEqual(h.events("timer"), [[25]]);
  assert.equal(h.count("sleep"), 0);
  assert.equal(h.count("native.exec"), 1);
});
