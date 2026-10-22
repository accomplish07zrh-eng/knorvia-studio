// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// hook-runner 的契约测试（B5 登记 + B6 插入顺序 + 聚合短路）。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/hook-runner.ts");
}

function config(overrides = {}) {
  return {
    timeoutMs: 5000,
    maxOutputBytes: 1024,
    events: {},
    ...overrides,
  };
}

function makeTempDirectory() {
  const removed = [];
  return {
    removed,
    port: {
      async createTempDirectory({ prefix }) {
        return { path: `/virtual/${prefix}0` };
      },
      async writeTranscript() {},
      async removeDirectory({ path }) {
        removed.push(path);
        return { removed: true };
      },
    },
  };
}

/** 假执行端口：按 command 返回预设结果。 */
function makeExecution(replies) {
  const calls = [];
  return {
    calls,
    port: {
      async run(request) {
        calls.push(request);
        const reply = replies[request.command.command ?? request.command.file] ?? {};
        return {
          status: reply.status ?? "completed",
          exitCode: reply.exitCode ?? 0,
          signal: undefined,
          stdout: { text: reply.stdout ?? "", bytes: 0, truncated: false },
          stderr: { text: reply.stderr ?? "", bytes: 0, truncated: false },
          durationMs: 1,
          timedOut: false,
          cancelled: false,
          startedAt: new Date(0),
          completedAt: new Date(0),
        };
      },
    },
  };
}

const input = { hookEventName: "PreToolUse", sessionId: "s1", toolName: "bash" };

test("B5.1 config.enabled === false → 无登记项", async () => {
  const { registerConfiguredHooks } = await loadPlugin();
  const registered = registerConfiguredHooks(
    config({
      enabled: false,
      events: { PreToolUse: { matchers: [{ hooks: [{ type: "command", command: "x" }] }] } },
    }),
    "PreToolUse",
  );
  assert.equal(registered.length, 0);
});

test("B5.2 hook.enabled === false 跳过该条", async () => {
  const { registerConfiguredHooks } = await loadPlugin();
  const registered = registerConfiguredHooks(
    config({
      events: {
        PreToolUse: {
          matchers: [
            {
              hooks: [
                { type: "command", command: "a" },
                { type: "command", command: "b", enabled: false },
              ],
            },
          ],
        },
      },
    }),
    "PreToolUse",
  );
  assert.equal(registered.length, 1);
  assert.equal(registered[0].hook.command, "a");
});

test("B5.3 source 的格式是 config.<event>.<matcherIndex>.<hookIndex>", async () => {
  const { registerConfiguredHooks } = await loadPlugin();
  const registered = registerConfiguredHooks(
    config({
      events: {
        PreToolUse: {
          matchers: [
            { hooks: [{ type: "command", command: "a" }] },
            {
              hooks: [
                { type: "command", command: "b" },
                { type: "command", command: "c" },
              ],
            },
          ],
        },
      },
    }),
    "PreToolUse",
  );
  assert.deepEqual(
    registered.map((r) => r.source),
    ["config.PreToolUse.0.0", "config.PreToolUse.1.0", "config.PreToolUse.1.1"],
  );
});

test("B5.5 每条都带 config 的 timeoutMs / maxOutputBytes", async () => {
  const { registerConfiguredHooks } = await loadPlugin();
  const registered = registerConfiguredHooks(
    config({
      timeoutMs: 3000,
      maxOutputBytes: 4096,
      events: { PreToolUse: { matchers: [{ hooks: [{ type: "command", command: "a" }] }] } },
    }),
    "PreToolUse",
  );
  assert.equal(registered[0].timeoutMs, 3000);
  assert.equal(registered[0].maxOutputBytes, 4096);
});

test("B5.7 无任何登记项 → 空数组（等价 undefined）", async () => {
  const { registerConfiguredHooks } = await loadPlugin();
  assert.deepEqual(registerConfiguredHooks(config(), "PreToolUse"), []);
  assert.deepEqual(
    registerConfiguredHooks(config({ events: { PreToolUse: { matchers: [] } } }), "PreToolUse"),
    [],
  );
});

test("matcher：无 matcher → 全匹配", async () => {
  const { matcherMatches } = await loadPlugin();
  assert.equal(matcherMatches(undefined, "bash"), true);
  assert.equal(matcherMatches(undefined, undefined), true);
  assert.equal(matcherMatches("", "bash"), true);
});

test("matcher：有 matcher 但无 toolName → 不匹配", async () => {
  const { matcherMatches } = await loadPlugin();
  assert.equal(matcherMatches("bash", undefined), false);
});

test("matcher：精确匹配才命中", async () => {
  const { matcherMatches } = await loadPlugin();
  assert.equal(matcherMatches("bash", "bash"), true);
  assert.equal(matcherMatches("bash", "write"), false);
});

test("聚合：首个 deny 短路，后续 Hook 不执行", async () => {
  const { registerConfiguredHooks, runEventHooks } = await loadPlugin();
  const registered = registerConfiguredHooks(
    config({
      events: {
        PreToolUse: {
          matchers: [
            {
              hooks: [
                { type: "command", command: "deny" },
                { type: "command", command: "should-not-run" },
              ],
            },
          ],
        },
      },
    }),
    "PreToolUse",
  );
  const execution = makeExecution({
    deny: {
      stdout: JSON.stringify({
        continue: false,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "no",
        },
      }),
    },
    "should-not-run": { stdout: JSON.stringify({ continue: true }) },
  });
  const temp = makeTempDirectory();

  const verdict = await runEventHooks(registered, input, {
    execution: execution.port,
    tempDirectory: temp.port,
    workingDirectory: "/w",
  });

  assert.equal(verdict.kind, "deny");
  assert.equal(verdict.reason, "no");
  assert.equal(execution.calls.length, 1, "第二个 Hook 不应执行（短路）");
});

test("聚合：都无意见 → no-opinion（全部执行）", async () => {
  const { registerConfiguredHooks, runEventHooks } = await loadPlugin();
  const registered = registerConfiguredHooks(
    config({
      events: {
        PreToolUse: {
          matchers: [
            {
              hooks: [
                { type: "command", command: "a" },
                { type: "command", command: "b" },
              ],
            },
          ],
        },
      },
    }),
    "PreToolUse",
  );
  const execution = makeExecution({ a: { stdout: "" }, b: { stdout: "" } });
  const temp = makeTempDirectory();

  const verdict = await runEventHooks(registered, input, {
    execution: execution.port,
    tempDirectory: temp.port,
    workingDirectory: "/w",
  });

  assert.equal(verdict.kind, "no-opinion");
  assert.equal(execution.calls.length, 2, "都应执行");
});

test("聚合：中间 Hook allow，后续 Hook deny → 仍可阻断", async () => {
  const { registerConfiguredHooks, runEventHooks } = await loadPlugin();
  const registered = registerConfiguredHooks(
    config({
      events: {
        PreToolUse: {
          matchers: [
            {
              hooks: [
                { type: "command", command: "allow" },
                { type: "command", command: "deny" },
              ],
            },
          ],
        },
      },
    }),
    "PreToolUse",
  );
  const execution = makeExecution({
    allow: {
      stdout: JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
      }),
    },
    deny: {
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "later",
        },
      }),
    },
  });
  const temp = makeTempDirectory();

  const verdict = await runEventHooks(registered, input, {
    execution: execution.port,
    tempDirectory: temp.port,
    workingDirectory: "/w",
  });

  // allow 是「有意见」→ 按设计会立即返回 allow（不继续）。
  // ⚠️ 这与「waterfall 的 allow 即放行」一致：显式允许后不再问后续 Hook。
  assert.equal(verdict.kind, "allow");
  assert.equal(execution.calls.length, 1);
});

test("matcher 不匹配的 Hook 不执行（省一次子进程）", async () => {
  const { registerConfiguredHooks, runEventHooks } = await loadPlugin();
  const registered = registerConfiguredHooks(
    config({
      events: {
        PreToolUse: {
          matchers: [{ matcher: "write", hooks: [{ type: "command", command: "should-not-run" }] }],
        },
      },
    }),
    "PreToolUse",
  );
  const execution = makeExecution({});
  const temp = makeTempDirectory();

  await runEventHooks(registered, input, {
    execution: execution.port,
    tempDirectory: temp.port,
    workingDirectory: "/w",
  });

  assert.equal(execution.calls.length, 0, "matcher 不匹配 → 不执行");
});

test("Hook 执行抛错 → 跳过该条，继续下一个（不伪装成拒绝）", async () => {
  const { registerConfiguredHooks, runEventHooks } = await loadPlugin();
  const registered = registerConfiguredHooks(
    config({
      events: {
        PreToolUse: {
          matchers: [
            {
              hooks: [
                { type: "command", command: "throws" },
                { type: "command", command: "deny" },
              ],
            },
          ],
        },
      },
    }),
    "PreToolUse",
  );
  let callIndex = 0;
  const port = {
    async run(request) {
      callIndex += 1;
      if (request.command.command === "throws") throw new Error("spawn failed");
      return {
        status: "completed",
        exitCode: 0,
        signal: undefined,
        stdout: {
          text: JSON.stringify({
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "deny",
              permissionDecisionReason: "second",
            },
          }),
          bytes: 0,
          truncated: false,
        },
        stderr: { text: "", bytes: 0, truncated: false },
        durationMs: 1,
        timedOut: false,
        cancelled: false,
        startedAt: new Date(0),
        completedAt: new Date(0),
      };
    },
  };
  const temp = makeTempDirectory();

  const verdict = await runEventHooks(registered, input, {
    execution: port,
    tempDirectory: temp.port,
    workingDirectory: "/w",
  });

  assert.equal(callIndex, 2, "第一个抛错后应继续第二个");
  assert.equal(verdict.kind, "deny", "第二个的拒绝生效");
});

test("每个 Hook 执行后临时目录都被清理（无泄漏）", async () => {
  const { registerConfiguredHooks, runEventHooks } = await loadPlugin();
  const registered = registerConfiguredHooks(
    config({
      events: {
        PreToolUse: {
          matchers: [
            {
              hooks: [
                { type: "command", command: "a" },
                { type: "command", command: "b" },
              ],
            },
          ],
        },
      },
    }),
    "PreToolUse",
  );
  const execution = makeExecution({ a: { stdout: "" }, b: { stdout: "" } });
  const temp = makeTempDirectory();

  await runEventHooks(registered, input, {
    execution: execution.port,
    tempDirectory: temp.port,
    workingDirectory: "/w",
  });

  assert.equal(temp.removed.length, 2, "两个 Hook 各清理一次");
});
