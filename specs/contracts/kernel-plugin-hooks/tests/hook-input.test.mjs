// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// hook-input 的契约测试（B1 的 19 条规格）。
//
// 用**内存替身**注入临时目录端口（不碰真实文件系统）——
// 这直接验证了「本包只依赖接口」这个设计。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/hook-input.ts");
}

/** 内存替身：记录创建/写入/删除，不碰真实文件系统。 */
function makeTempDirectory() {
  const created = [];
  const written = [];
  const removed = [];
  return {
    created,
    written,
    removed,
    port: {
      async createTempDirectory({ prefix }) {
        const path = `/virtual/${prefix}${created.length}`;
        created.push(path);
        return { path };
      },
      async writeTranscript(path, content) {
        written.push({ path, content });
      },
      async removeDirectory({ path }) {
        removed.push(path);
        return { removed: true };
      },
    },
  };
}

function baseInput(overrides = {}) {
  return {
    hookEventName: "PreToolUse",
    sessionId: "s1",
    mode: "build",
    agentName: "main",
    cwd: "/work",
    ...overrides,
  };
}

test("B1.1 固定别名都在载荷里", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const { value } = await buildHookStdin(baseInput(), temp.port);
  const payload = JSON.parse(value);

  assert.equal(payload.hook_event_name, "PreToolUse");
  assert.equal(payload.session_id, "s1");
  assert.equal(payload.permission_mode, "build");
  assert.equal(payload.agent_type, "main");
});

test("B1.2 transcript_path 与 transcriptPath 同值，且指向临时目录", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const { value } = await buildHookStdin(baseInput(), temp.port);
  const payload = JSON.parse(value);

  assert.equal(payload.transcript_path, payload.transcriptPath, "两种拼法必须同值");
  assert.ok(
    payload.transcript_path.includes("transcript.jsonl"),
    `应指向 transcript.jsonl，实际：${payload.transcript_path}`,
  );
  // 用 path 归一化后再比较：Windows 上 join 会产生反斜杠，而替身的虚拟路径用正斜杠。
  const { resolve } = await import("node:path");
  assert.equal(
    resolve(payload.transcript_path),
    resolve(temp.created[0], "transcript.jsonl"),
    "应在创建的临时目录里",
  );
});

test("B1.3/B1.4 Stop 的 transcript 是 assistant 行", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  await buildHookStdin(
    baseInput({ hookEventName: "Stop", responseText: "final answer" }),
    temp.port,
  );

  const line = temp.written[0].content;
  assert.ok(line.endsWith("\n"), "transcript 每行以换行结尾");
  const parsed = JSON.parse(line);
  assert.equal(parsed.message.role, "assistant");
  assert.equal(parsed.message.content[0].text, "final answer");
  assert.equal(parsed.message.content[0].type, "text");
});

test("B1.3/B1.4 UserPromptSubmit 的 transcript 是 user 行", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  await buildHookStdin(
    baseInput({ hookEventName: "UserPromptSubmit", prompt: "hello" }),
    temp.port,
  );

  const parsed = JSON.parse(temp.written[0].content);
  assert.equal(parsed.message.role, "user");
  assert.equal(parsed.message.content[0].text, "hello");
});

test("B1.3 其他事件的 transcript 是空文件", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  await buildHookStdin(baseInput({ hookEventName: "PreToolUse" }), temp.port);
  assert.equal(temp.written[0].content, "", "PreToolUse 不需要 transcript 内容");
});

test("B1.5 PreToolUse 带 tool_name / tool_input / tool_use_id", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const { value } = await buildHookStdin(
    baseInput({
      hookEventName: "PreToolUse",
      toolName: "bash",
      toolInput: { command: "ls" },
      toolCallId: "call-1",
    }),
    temp.port,
  );
  const payload = JSON.parse(value);

  assert.equal(payload.tool_name, "bash");
  assert.deepEqual(payload.tool_input, { command: "ls" }, "tool_input 是已解析对象");
  assert.equal(payload.tool_use_id, "call-1");
});

test("B1.5 无 toolName 时三个工具字段都不出现", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const { value } = await buildHookStdin(baseInput({ hookEventName: "SessionStart" }), temp.port);
  const payload = JSON.parse(value);

  assert.equal("tool_name" in payload, false);
  assert.equal("tool_input" in payload, false);
  assert.equal("tool_use_id" in payload, false);
});

test("B1.6 PermissionRequest → permission_suggestions", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const { value } = await buildHookStdin(
    baseInput({
      hookEventName: "PermissionRequest",
      permissionSuggestions: [{ kind: "allow" }],
    }),
    temp.port,
  );
  assert.deepEqual(JSON.parse(value).permission_suggestions, [{ kind: "allow" }]);
});

test("B1.7 PostToolUse → tool_response", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const { value } = await buildHookStdin(
    baseInput({ hookEventName: "PostToolUse", toolResponse: { ok: true } }),
    temp.port,
  );
  assert.deepEqual(JSON.parse(value).tool_response, { ok: true });
});

test("B1.8 PostToolUseFailure → error（字符串）+ error_details（对象）+ is_interrupt", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const { value } = await buildHookStdin(
    baseInput({
      hookEventName: "PostToolUseFailure",
      error: { message: "boom" },
      isInterrupt: true,
    }),
    temp.port,
  );
  const payload = JSON.parse(value);

  assert.equal(payload.error, "boom", "error 是字符串");
  assert.deepEqual(payload.error_details, { message: "boom" }, "error_details 是对象");
  assert.equal(payload.is_interrupt, true);
});

test("B1.9 Stop → last_assistant_message + stop_hook_active", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const { value } = await buildHookStdin(
    baseInput({
      hookEventName: "Stop",
      responseText: "done",
      stopHookActive: false,
    }),
    temp.port,
  );
  const payload = JSON.parse(value);

  assert.equal(payload.last_assistant_message, "done");
  assert.equal(payload.stop_hook_active, false);
});

test("B1.10 SessionStart / UserPromptSubmit / PreToolUse 无额外别名", async () => {
  const { buildHookStdin } = await loadPlugin();

  for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse"]) {
    const temp = makeTempDirectory();
    const { value } = await buildHookStdin(
      baseInput({ hookEventName: event, responseText: "x", prompt: "y" }),
      temp.port,
    );
    const payload = JSON.parse(value);
    assert.equal("last_assistant_message" in payload, false, `${event} 不应带 Stop 别名`);
    assert.equal("tool_response" in payload, false, `${event} 不应带 PostToolUse 别名`);
    assert.equal("permission_suggestions" in payload, false, `${event} 不应带审批别名`);
  }
});

test("B1.11 返回值以换行结尾", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const { value } = await buildHookStdin(baseInput(), temp.port);
  assert.ok(value.endsWith("\n"), "stdin 内容必须以换行结尾");
});

test("B1.12/B1.13 cleanup 递归删除且可重复调用", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const { cleanup } = await buildHookStdin(baseInput(), temp.port);
  await cleanup();
  await cleanup();

  assert.equal(temp.removed.length, 1, "第二次 cleanup 不应重复删除（幂等）");
  assert.equal(temp.removed[0], temp.created[0]);
});

test("边界：agentName 缺失时 JSON 里没有 agent_type 键（不是 null）", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const input = baseInput();
  delete input.agentName;
  const { value } = await buildHookStdin(input, temp.port);

  assert.equal("agent_type" in JSON.parse(value), false, "undefined 键应被 JSON.stringify 丢弃");
});

test("边界：原始 camelCase 字段仍在载荷里（别名是叠加不是替换）", async () => {
  const { buildHookStdin } = await loadPlugin();
  const temp = makeTempDirectory();

  const { value } = await buildHookStdin(
    baseInput({ hookEventName: "PreToolUse", toolName: "bash" }),
    temp.port,
  );
  const payload = JSON.parse(value);

  assert.equal(payload.hookEventName, "PreToolUse", "原始字段必须保留");
  assert.equal(payload.sessionId, "s1");
  assert.equal(payload.hook_event_name, "PreToolUse", "别名也要有");
});
