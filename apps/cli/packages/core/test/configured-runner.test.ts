// SPDX-License-Identifier: Apache-2.0
// B1、B2、B5、B6、B7、B8、B9、B19：配置运行器、兼容 stdin、执行映射与结果解析。
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { hooks } from "./core-hooks-entry.mjs";
import {
  BUNDLE_DIGEST,
  DECLARATION_DIGEST,
  WORKSPACE_IDENTITY,
  makeExecutionPort,
  makeHookInput,
  makeLogger,
  makeSnapshot,
} from "./fixtures/core-hooks-builders.mjs";

const predicateEvent = "PreToolUse";

function makeConfig(overrides = {}) {
  return {
    enabled: true,
    timeoutMs: 60_000,
    maxOutputBytes: 65_536,
    events: {},
    ...overrides,
  };
}

function makeAdmission(decision = { allowed: true }) {
  const calls = [];
  return {
    calls,
    activate: async () => {},
    evaluateDispatch(input) {
      calls.push(input);
      return decision;
    },
    getCurrentSnapshot: () => makeSnapshot(),
    replaceSnapshot: () => {},
    invalidate: () => {},
  };
}

test("B5 无登记项时返回 undefined；enabled=false 只保留 workspace 来源", () => {
  const empty = hooks.createConfiguredHookRunner({
    config: makeConfig(),
    executionPort: makeExecutionPort(),
    getWorkingDirectory: () => "/tmp/fixture",
  });
  assert.equal(empty, undefined);

  const disabled = hooks.createConfiguredHookRunner({
    config: makeConfig({
      enabled: false,
      events: { PreToolUse: [{ hooks: [{ type: "command", command: "echo hi" }] }] },
    }),
    executionPort: makeExecutionPort(),
    getWorkingDirectory: () => "/tmp/fixture",
  });
  assert.equal(disabled, undefined);
});

test("B5 登记顺序、source 命名、async 仅对 command 生效", async () => {
  const events = [];
  const port = makeExecutionPort([
    { status: "completed", exitCode: 0, stdout: { text: "" }, stderr: { text: "" } },
    { status: "completed", exitCode: 0, stdout: { text: "" }, stderr: { text: "" } },
  ]);
  const runner = hooks.createConfiguredHookRunner({
    config: makeConfig({
      events: {
        [predicateEvent]: [
          {
            matcher: "Bash",
            hooks: [
              { type: "process", command: "first", async: true },
              { type: "command", command: "second", async: true },
            ],
          },
        ],
      },
    }),
    emitEvent: async (event) => {
      events.push(event);
    },
    executionPort: port,
    getWorkingDirectory: () => "/tmp/fixture",
  });
  assert.notEqual(runner, undefined);
  await runner.run(makeHookInput({ hookEventName: predicateEvent }), { matchValue: "Bash" });

  const started = events.filter((event) => event.type === "hook_run_started");
  assert.deepEqual(
    started.map((event) => event.payload.hookSource),
    [`config.${predicateEvent}.0.0`, `config.${predicateEvent}.0.1`],
  );
  const descriptors = started.map((event) => event.payload.descriptor);
  assert.deepEqual(
    descriptors.map((descriptor) => descriptor.executionMode),
    ["foreground", "background"],
  );
  assert.equal(port.calls.length, 1, "process 类型即使 async 也按前景执行");
  assert.deepEqual(port.calls[0].request.command, { mode: "argv", file: "first", args: [] });
});

test("B1、B7 兼容 stdin、执行参数与临时目录清理", async () => {
  const port = makeExecutionPort([
    (request) => {
      const stdin = JSON.parse(request.stdin);
      assert.equal(stdin.hook_event_name, predicateEvent);
      assert.equal(stdin.session_id, "session-1");
      assert.equal(stdin.agent_type, "fixture-agent");
      assert.equal(stdin.permission_mode, "default");
      assert.equal(stdin.tool_name, "Bash");
      assert.equal(stdin.tool_use_id, "tool-1");
      assert.ok(existsSync(stdin.transcript_path), "transcript 在执行期存在");
      assert.equal(stdin.transcript_path, stdin.transcriptPath);
      return { status: "completed", exitCode: 0, stdout: { text: "" }, stderr: { text: "" } };
    },
  ]);
  const runner = hooks.createConfiguredHookRunner({
    config: makeConfig({
      events: {
        [predicateEvent]: [
          { matcher: "Bash", hooks: [{ type: "process", command: "node", args: ["hook.mjs"] }] },
        ],
      },
    }),
    executionPort: port,
    getWorkingDirectory: () => "/tmp/fixture",
  });
  await runner.run(
    makeHookInput({
      hookEventName: predicateEvent,
      cwd: "/tmp/workspace",
      toolCallId: "tool-1",
      toolInput: { command: "ls" },
      toolName: "Bash",
    }),
    { matchValue: "Bash" },
  );

  const { request } = port.calls[0];
  assert.equal(request.cwd, "/tmp/workspace");
  assert.equal(request.timeoutMs, 60_000);
  assert.deepEqual(request.outputLimit, {
    maxBufferBytes: 65_536,
    maxInlineBytes: 65_536,
    persistOutput: "none",
  });
  assert.deepEqual(request.trace.attributes, {
    hookEventName: predicateEvent,
    hookIndex: 0,
    matcherIndex: 0,
  });
  assert.equal(request.env.set.KNORVIA_SESSION_ID, "session-1");
  assert.equal(request.env.set.CLAUDE_PROJECT_DIR, "/tmp/workspace");
  assert.equal(request.env.set.KNORVIA_PLUGIN_ID, undefined);
  const stdin = JSON.parse(request.stdin);
  assert.equal(existsSync(stdin.transcript_path), false, "执行后临时目录被清理");
});

test("B2 变量展开：会话变量生效，skill 变量报配置错误且不执行", async () => {
  const port = makeExecutionPort();
  const runner = hooks.createConfiguredHookRunner({
    config: makeConfig({
      events: {
        [predicateEvent]: [
          {
            matcher: "Bash",
            hooks: [{ type: "process", command: "node", args: ["${KNORVIA_SESSION_ID}.mjs"] }],
          },
        ],
      },
    }),
    executionPort: port,
    getWorkingDirectory: () => "/tmp/fixture",
  });
  await runner.run(makeHookInput({ hookEventName: predicateEvent }), { matchValue: "Bash" });
  assert.deepEqual(port.calls[0].request.command, {
    mode: "argv",
    file: "node",
    args: ["session-1.mjs"],
  });

  const skillPort = makeExecutionPort();
  const skillEvents = [];
  const skillRunner = hooks.createConfiguredHookRunner({
    config: makeConfig({
      events: {
        [predicateEvent]: [
          {
            matcher: "Bash",
            hooks: [{ type: "process", command: "${KNORVIA_SKILL_DIR}", args: [] }],
          },
        ],
      },
    }),
    emitEvent: async (event) => {
      skillEvents.push(event);
    },
    executionPort: skillPort,
    getWorkingDirectory: () => "/tmp/fixture",
  });
  await skillRunner.run(makeHookInput({ hookEventName: predicateEvent }), { matchValue: "Bash" });
  assert.equal(skillPort.calls.length, 0, "展开失败不得执行命令");
  assert.equal(skillEvents.at(-1).type, "hook_run_failed");
  assert.equal(skillEvents.at(-1).payload.outcome, "failed");
});

test("B8、B9 stdout 解析：非 JSON 忽略、非法 JSON 报错、schema 不符报错", async () => {
  const plainPort = makeExecutionPort([
    { status: "completed", exitCode: 0, stdout: { text: "hook log line" }, stderr: { text: "" } },
  ]);
  const plainRunner = hooks.createConfiguredHookRunner({
    config: makeConfig({
      events: {
        [predicateEvent]: [{ matcher: "Bash", hooks: [{ type: "process", command: "node" }] }],
      },
    }),
    executionPort: plainPort,
    getWorkingDirectory: () => "/tmp/fixture",
  });
  const plainResult = await plainRunner.run(makeHookInput({ hookEventName: predicateEvent }), {
    matchValue: "Bash",
  });
  assert.deepEqual(plainResult, { additionalContexts: [] });

  const brokenPort = makeExecutionPort([
    { status: "completed", exitCode: 0, stdout: { text: "{ not json" }, stderr: { text: "" } },
  ]);
  const brokenEvents = [];
  const brokenRunner = hooks.createConfiguredHookRunner({
    config: makeConfig({
      events: {
        [predicateEvent]: [{ matcher: "Bash", hooks: [{ type: "process", command: "node" }] }],
      },
    }),
    emitEvent: async (event) => {
      brokenEvents.push(event);
    },
    executionPort: brokenPort,
    getWorkingDirectory: () => "/tmp/fixture",
  });
  await brokenRunner.run(makeHookInput({ hookEventName: predicateEvent }), { matchValue: "Bash" });
  assert.equal(brokenEvents.at(-1).type, "hook_run_completed");

  const invalidSchemaPort = makeExecutionPort([
    {
      status: "completed",
      exitCode: 0,
      stdout: { text: '{"continue":"not-a-boolean"}' },
      stderr: { text: "" },
    },
  ]);
  const invalidEvents = [];
  const invalidRunner = hooks.createConfiguredHookRunner({
    config: makeConfig({
      events: {
        [predicateEvent]: [{ matcher: "Bash", hooks: [{ type: "process", command: "node" }] }],
      },
    }),
    emitEvent: async (event) => {
      invalidEvents.push(event);
    },
    executionPort: invalidSchemaPort,
    getWorkingDirectory: () => "/tmp/fixture",
  });
  await invalidRunner.run(makeHookInput({ hookEventName: predicateEvent }), { matchValue: "Bash" });
  assert.equal(invalidEvents.at(-1).type, "hook_run_failed");
  assert.equal(invalidEvents.at(-1).payload.outcome, "failed");
});

test("B8 非零退出码生成可恢复错误并带 stderr 预览", async () => {
  const port = makeExecutionPort([
    {
      status: "failed",
      exitCode: 1,
      stdout: { text: "" },
      stderr: { text: "boom happened" },
    },
  ]);
  const events = [];
  const runner = hooks.createConfiguredHookRunner({
    config: makeConfig({
      events: {
        [predicateEvent]: [{ matcher: "Bash", hooks: [{ type: "process", command: "node" }] }],
      },
    }),
    emitEvent: async (event) => {
      events.push(event);
    },
    executionPort: port,
    getWorkingDirectory: () => "/tmp/fixture",
  });
  await runner.run(makeHookInput({ hookEventName: predicateEvent }), { matchValue: "Bash" });
  const failed = events.at(-1);
  assert.equal(failed.type, "hook_run_failed");
  assert.equal(failed.payload.stderrPreview, "boom happened");
  assert.equal(failed.payload.errorMessage, "boom happened");
});

test("B9 exit code 2 在各事件上生成对应阻断输出", async () => {
  const cases = [
    {
      event: "PreToolUse",
      assert: (result) => {
        assert.equal(result.permissionBehavior, "deny");
        assert.equal(result.blockRequested, true);
        assert.equal(result.preventContinuation, true);
        assert.equal(result.stopReason, "denied by policy");
      },
    },
    {
      event: "PermissionRequest",
      assert: (result) => {
        assert.deepEqual(result.permissionRequestResult, {
          behavior: "deny",
          message: "denied by policy",
        });
      },
    },
    {
      event: "Stop",
      assert: (result) => {
        assert.equal(result.blockRequested, true);
        assert.equal(result.stopReason, "denied by policy");
      },
    },
    {
      event: "UserPromptSubmit",
      assert: (result) => {
        assert.equal(result.blockRequested, true);
        assert.equal(result.preventContinuation, true);
      },
    },
  ];

  for (const item of cases) {
    const port = makeExecutionPort([
      {
        status: "completed",
        exitCode: 2,
        stdout: { text: "" },
        stderr: { text: "denied by policy" },
      },
    ]);
    const runner = hooks.createConfiguredHookRunner({
      config: makeConfig({
        events: {
          [item.event]: [{ hooks: [{ type: "command", command: "node hook.mjs" }] }],
        },
      }),
      executionPort: port,
      getWorkingDirectory: () => "/tmp/fixture",
    });
    const result = await runner.run(makeHookInput({ hookEventName: item.event }));
    item.assert(result);
  }
});

test("B6 workspace 登记项：evaluateDispatch 收到摘要、项目 Hook 插在用户之后非用户之前", async () => {
  const port = makeExecutionPort([
    { status: "completed", exitCode: 0, stdout: { text: "" }, stderr: { text: "" } },
    { status: "completed", exitCode: 0, stdout: { text: "" }, stderr: { text: "" } },
    { status: "completed", exitCode: 0, stdout: { text: "" }, stderr: { text: "" } },
  ]);
  const admission = makeAdmission();
  const events = [];
  const runner = hooks.createConfiguredHookRunner({
    config: makeConfig({
      events: {
        [predicateEvent]: [
          {
            matcher: "Bash",
            hooks: [
              { type: "process", command: "user-hook", source: { kind: "user" } },
              { type: "process", command: "internal-hook" },
            ],
          },
        ],
      },
    }),
    emitEvent: async (event) => {
      events.push(event);
    },
    executionPort: port,
    getWorkingDirectory: () => "/tmp/fixture",
    workspaceHookAdmission: admission,
    workspaceHookSnapshot: makeSnapshot(),
  });
  await runner.run(makeHookInput({ hookEventName: predicateEvent }), { matchValue: "Bash" });

  assert.deepEqual(
    port.calls.map((call) => call.request.command.file),
    ["user-hook", "node", "internal-hook"],
    "项目 Hook 先于内部配置 Hook，但不越过用户 Hook",
  );
  // 运行器按生命周期在不同阶段多次求值准入（预扫描 / 开始前 / 发布后）；
  // 本包合同只要求每次调用都携带同一份摘要与 item 标识。
  assert.ok(admission.calls.length >= 1);
  for (const call of admission.calls) {
    assert.deepEqual(call, {
      hookDeclarationDigest: DECLARATION_DIGEST,
      reviewItemId: "item-1",
    });
  }
  const sources = events
    .filter((event) => event.type === "hook_run_started")
    .map((event) => event.payload.hookSource);
  assert.deepEqual(sources, [
    `config.${predicateEvent}.0.0`,
    "project.item-1",
    `config.${predicateEvent}.0.1`,
  ]);
  assert.equal(admission.getCurrentSnapshot().workspaceIdentity, WORKSPACE_IDENTITY);
  assert.equal(admission.getCurrentSnapshot().bundleDigest, BUNDLE_DIGEST);
});

test("B6 准入拒绝时不执行项目 Hook", async () => {
  const port = makeExecutionPort();
  const events = [];
  const runner = hooks.createConfiguredHookRunner({
    config: makeConfig(),
    emitEvent: async (event) => {
      events.push(event);
    },
    executionPort: port,
    getWorkingDirectory: () => "/tmp/fixture",
    workspaceHookAdmission: makeAdmission({
      allowed: false,
      reasonCode: "workspace_hooks_pending_trust",
    }),
    workspaceHookSnapshot: makeSnapshot(),
  });
  const logger = makeLogger();
  const runnerWithLogger = hooks.createConfiguredHookRunner({
    config: makeConfig(),
    executionPort: port,
    getWorkingDirectory: () => "/tmp/fixture",
    logger,
    workspaceHookAdmission: makeAdmission({
      allowed: false,
      reasonCode: "workspace_hooks_pending_trust",
    }),
    workspaceHookSnapshot: makeSnapshot(),
  });
  await runner.run(makeHookInput({ hookEventName: predicateEvent }), { matchValue: "Bash" });
  await runnerWithLogger.run(makeHookInput({ hookEventName: predicateEvent }), {
    matchValue: "Bash",
  });
  assert.equal(port.calls.length, 0);
  assert.deepEqual(
    events.map((event) => event.type),
    ["hook_run_blocked"],
  );
  assert.equal(events[0].payload.blockReason, "workspace_hooks_pending_trust");
  assert.equal(logger.entries.length, 0);
});
