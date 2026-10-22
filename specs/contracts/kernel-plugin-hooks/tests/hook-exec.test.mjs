// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// hook-exec 的契约测试（B7 的 6 条规格）。
//
// 用**假的 ExecutionPort**（记录请求、按预设返回）——
// 这样测试「本模块怎么构造执行请求」而不依赖真实子进程。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/hook-exec.ts");
}

/** 造一个记录请求的假执行端口。 */
function makeExecution(outcome = {}) {
  const calls = [];
  return {
    calls,
    port: {
      async run(request, options) {
        calls.push({ request, options });
        return {
          status: outcome.status ?? "completed",
          exitCode: outcome.exitCode ?? 0,
          signal: undefined,
          stdout: { text: outcome.stdout ?? "", bytes: 0, truncated: false },
          stderr: { text: outcome.stderr ?? "", bytes: 0, truncated: false },
          durationMs: 1,
          timedOut: outcome.timedOut ?? false,
          cancelled: outcome.cancelled ?? false,
          startedAt: new Date(0),
          completedAt: new Date(0),
        };
      },
    },
  };
}

function makeTempDirectory({ throwOnCreate = false, throwOnWrite = false } = {}) {
  const created = [];
  const written = [];
  const removed = [];
  return {
    created,
    written,
    removed,
    port: {
      async createTempDirectory({ prefix }) {
        if (throwOnCreate) throw new Error("cannot create");
        const path = `/virtual/${prefix}${created.length}`;
        created.push(path);
        return { path };
      },
      async writeTranscript(path, content) {
        if (throwOnWrite) throw new Error("cannot write");
        written.push({ path, content });
      },
      async removeDirectory({ path }) {
        removed.push(path);
        return { removed: true };
      },
    },
  };
}

function request(overrides = {}) {
  return {
    hook: { type: "process", command: "/bin/hook", args: ["--x"] },
    input: { hookEventName: "PreToolUse", sessionId: "s1", cwd: "/work" },
    workingDirectory: "/fallback",
    timeoutMs: 5000,
    maxOutputBytes: 1024,
    ...overrides,
  };
}

test("B7.1 process 类型 → argv 形态（不经 shell）", async () => {
  const { runHook } = await loadPlugin();
  const execution = makeExecution();
  const temp = makeTempDirectory();

  await runHook(request(), execution.port, temp.port);

  const command = execution.calls[0].request.command;
  assert.equal(command.mode, "argv");
  assert.equal(command.file, "/bin/hook");
  assert.deepEqual(command.args, ["--x"]);
});

test("B7.1 command 类型 → shell 形态", async () => {
  const { runHook } = await loadPlugin();
  const execution = makeExecution();
  const temp = makeTempDirectory();

  await runHook(
    request({ hook: { type: "command", command: "echo hi" } }),
    execution.port,
    temp.port,
  );

  const command = execution.calls[0].request.command;
  assert.equal(command.mode, "shell");
  assert.equal(command.command, "echo hi");
});

test("B7.2 cwd / env / stdin / timeoutMs / outputLimit 都传对", async () => {
  const { runHook } = await loadPlugin();
  const execution = makeExecution();
  const temp = makeTempDirectory();

  await runHook(request(), execution.port, temp.port);

  const sent = execution.calls[0].request;
  assert.equal(sent.cwd, "/work", "cwd 优先用 input.cwd");
  assert.equal(sent.env.KNORVIA_SESSION_ID, "s1", "env 应含 B2 的变量");
  assert.ok(sent.stdin.endsWith("\n"), "stdin 应带结尾换行");
  assert.equal(sent.timeoutMs, 5000);
  assert.equal(sent.outputLimit.maxBufferBytes, 1024);
  assert.equal(sent.outputLimit.maxInlineBytes, 1024);
  assert.equal(sent.outputLimit.persistOutput, "none", "persistOutput 必须是 none");
});

test("B7.2 cwd 缺失时用 workingDirectory", async () => {
  const { runHook } = await loadPlugin();
  const execution = makeExecution();
  const temp = makeTempDirectory();

  await runHook(
    request({ input: { hookEventName: "PreToolUse", sessionId: "s1" } }),
    execution.port,
    temp.port,
  );
  assert.equal(execution.calls[0].request.cwd, "/fallback");
});

test("B7.3 命令与参数都做变量展开", async () => {
  const { runHook } = await loadPlugin();
  const execution = makeExecution();
  const temp = makeTempDirectory();

  await runHook(
    request({
      hook: {
        type: "process",
        command: "${KNORVIA_PLUGIN_ROOT}/bin/hook",
        args: ["--s=${KNORVIA_SESSION_ID}"],
      },
      plugin: { id: "p1", name: "P", rootPath: "/plugins/p1", dataPath: "/data/p1" },
    }),
    execution.port,
    temp.port,
  );

  const command = execution.calls[0].request.command;
  assert.equal(command.file, "/plugins/p1/bin/hook");
  assert.deepEqual(command.args, ["--s=s1"]);
});

test("B7.3 展开失败要向上抛（不静默回退）", async () => {
  const { runHook } = await loadPlugin();
  const execution = makeExecution();
  const temp = makeTempDirectory();

  let caught;
  try {
    await runHook(
      request({ hook: { type: "command", command: "x=${CLAUDE_SKILL_DIR}" } }),
      execution.port,
      temp.port,
    );
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, "skill 变量应抛错");
  assert.equal(caught.name, "HookVariableError");
  assert.equal(execution.calls.length, 0, "不应执行");
});

test("B7.4 成功后 cleanup 被调用（临时目录删掉）", async () => {
  const { runHook } = await loadPlugin();
  const execution = makeExecution();
  const temp = makeTempDirectory();

  await runHook(request(), execution.port, temp.port);

  assert.equal(temp.removed.length, 1, "应删除临时目录");
  assert.equal(temp.removed[0], temp.created[0]);
});

test("B7.4 执行失败后 cleanup 也被调用", async () => {
  const { runHook } = await loadPlugin();
  const execution = makeExecution({ status: "failed", exitCode: 1 });
  const temp = makeTempDirectory();

  await runHook(request(), execution.port, temp.port);
  assert.equal(temp.removed.length, 1, "失败时也要清理");
});

test("B7.4 执行抛错后 cleanup 也被调用", async () => {
  const { runHook } = await loadPlugin();
  const temp = makeTempDirectory();
  const port = {
    async run() {
      throw new Error("spawn failed");
    },
  };

  let caught;
  try {
    await runHook(request(), port, temp.port);
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, "错误应向上抛");
  assert.equal(temp.removed.length, 1, "抛错时也要清理");
});

test("B7.4 取消（signal abort）后 cleanup 也被调用", async () => {
  const { runHook } = await loadPlugin();
  const temp = makeTempDirectory();
  const controller = new AbortController();
  controller.abort();

  const port = {
    async run(_request, options) {
      // 模拟执行端口：收到已 abort 的 signal 时抛取消错误。
      if (options?.signal?.aborted) throw new Error("cancelled");
      throw new Error("should not reach");
    },
  };

  let caught;
  try {
    await runHook(request({ signal: controller.signal }), port, temp.port);
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, "取消应抛出");
  assert.equal(temp.removed.length, 1, "取消时也必须 cleanup（B7.4 明确要求）");
});

test("B7.4/VariableError 展开失败时 cleanup 也执行", async () => {
  const { runHook } = await loadPlugin();
  const execution = makeExecution();
  const temp = makeTempDirectory();

  try {
    await runHook(
      request({ hook: { type: "command", command: "${CLAUDE_SKILL_DIR}" } }),
      execution.port,
      temp.port,
    );
  } catch {
    // 预期抛错
  }

  assert.equal(temp.removed.length, 1, "展开失败时临时目录也要清理");
});

test("B7.5 signal 透传给执行端口", async () => {
  const { runHook } = await loadPlugin();
  const execution = makeExecution();
  const temp = makeTempDirectory();
  const controller = new AbortController();

  await runHook(request({ signal: controller.signal }), execution.port, temp.port);

  assert.equal(execution.calls[0].options.signal, controller.signal);
});

test("B8 前置：执行结果映射（status/exitCode/stdout/stderr）", async () => {
  const { runHook } = await loadPlugin();
  const execution = makeExecution({ status: "completed", exitCode: 0, stdout: '{"ok":true}\n' });
  const temp = makeTempDirectory();

  const outcome = await runHook(request(), execution.port, temp.port);

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.stdout, '{"ok":true}\n');
});
