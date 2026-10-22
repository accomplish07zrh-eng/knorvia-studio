// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// hook-parse 的契约测试（B8 的 5 条 + B9 的 2 条）。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/hook-parse.ts");
}

function outcome(overrides = {}) {
  return {
    status: "completed",
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    cancelled: false,
    ...overrides,
  };
}

test("B9.1 空 stdout → undefined（不算错）", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const result = parseHookOutcome(outcome({ stdout: "   " }), "PreToolUse");
  assert.equal(result.output, undefined);
});

test("B9.1 不以 { 开头 → undefined（Hook 打印日志不得让动作失败）", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const result = parseHookOutcome(outcome({ stdout: "just a log line\n" }), "PreToolUse");
  assert.equal(result.output, undefined);
});

test("B9.1 以 { 开头但 JSON 解析失败 → undefined（日志恰好以 { 开头）", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const result = parseHookOutcome(outcome({ stdout: "{not valid json" }), "PreToolUse");
  assert.equal(result.output, undefined);
});

test("B9.1 合法 JSON 且形状正确 → 返回解析后的对象", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const payload = {
    continue: false,
    reason: "blocked",
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" },
  };
  const result = parseHookOutcome(outcome({ stdout: JSON.stringify(payload) }), "PreToolUse");
  assert.deepEqual(result.output, payload);
});

test("B9.1 形状不符 → 抛 HookOutputSchemaError（recoverable）", async () => {
  const { parseHookOutcome } = await loadPlugin();

  let caught;
  try {
    // continue 应为 boolean，这里给字符串
    parseHookOutcome(outcome({ stdout: '{"continue":"yes"}' }), "PreToolUse");
  } catch (error) {
    caught = error;
  }

  assert.ok(caught);
  assert.equal(caught.name, "HookOutputSchemaError");
  assert.equal(caught.recoverable, true);
  assert.equal(caught.hookEventName, "PreToolUse");
  assert.ok(caught.errors.length > 0);
});

test("B9.1 以 [ 开头（非对象）→ 不算错，返回 undefined", async () => {
  const { parseHookOutcome } = await loadPlugin();
  let caught;
  let result;
  try {
    result = parseHookOutcome(outcome({ stdout: '["array"]' }), "PreToolUse");
  } catch (error) {
    caught = error;
  }
  // '["array"]' 不以 `{` 开头 → 走「不算错」路径
  assert.equal(caught, undefined, "不以 { 开头 → 不算错");
  assert.equal(result.output, undefined);
});

test("B9.2 exitCode=2 且 PreToolUse → 合成 deny 输出", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const result = parseHookOutcome(
    outcome({ status: "failed", exitCode: 2, stderr: "blocked by policy" }),
    "PreToolUse",
  );

  assert.equal(result.output.continue, false);
  assert.equal(result.output.reason, "blocked by policy");
  assert.equal(result.output.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(result.output.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(result.output.hookSpecificOutput.permissionDecisionReason, "blocked by policy");
});

test("B9.2 exitCode=2 且 PermissionRequest → decision.behavior=deny", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const result = parseHookOutcome(
    outcome({ status: "failed", exitCode: 2, stderr: "no" }),
    "PermissionRequest",
  );

  assert.equal(result.output.continue, false);
  assert.deepEqual(result.output.hookSpecificOutput.decision, {
    behavior: "deny",
    message: "no",
  });
});

test("B9.2 exitCode=2 且 Stop → decision=block", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const result = parseHookOutcome(
    outcome({ status: "failed", exitCode: 2, stderr: "wait" }),
    "Stop",
  );

  assert.equal(result.output.decision, "block");
  assert.equal(result.output.reason, "wait");
  assert.equal(result.output.continue, undefined, "Stop 的阻断输出不带 continue");
});

test("B9.2 exitCode=2 且其他事件 → 只有 continue + reason", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const result = parseHookOutcome(
    outcome({ status: "failed", exitCode: 2, stderr: "no" }),
    "UserPromptSubmit",
  );

  assert.equal(result.output.continue, false);
  assert.equal(result.output.reason, "no");
  assert.equal(result.output.hookSpecificOutput, undefined);
});

test("B9.2 exitCode=2 无预览 → 用默认原因", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const result = parseHookOutcome(outcome({ status: "failed", exitCode: 2 }), "PreToolUse");
  assert.equal(result.output.reason, "Hook blocked execution");
});

test("B8.3 非零退出（非 2）→ 抛 HookExecutionFailedError（recoverable）", async () => {
  const { parseHookOutcome } = await loadPlugin();

  let caught;
  try {
    parseHookOutcome(outcome({ status: "failed", exitCode: 1, stderr: "boom" }), "PreToolUse");
  } catch (error) {
    caught = error;
  }

  assert.ok(caught);
  assert.equal(caught.name, "HookExecutionFailedError");
  assert.equal(caught.recoverable, true);
  assert.equal(caught.context.exitCode, 1);
  assert.equal(caught.context.hookEventName, "PreToolUse");
  assert.equal(caught.context.status, "failed");
  assert.equal(caught.context.stderrPreview, "boom");
  assert.equal(caught.message, "boom", "cause.message 应是 stderr 预览");
});

test("B8.3 timed_out / cancelled / spawn_error 也走失败分支", async () => {
  const { parseHookOutcome } = await loadPlugin();

  for (const status of ["timed_out", "cancelled", "spawn_error"]) {
    let caught;
    try {
      parseHookOutcome(outcome({ status, exitCode: undefined }), "PreToolUse");
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, `${status} 应抛错`);
    assert.equal(caught.name, "HookExecutionFailedError");
    assert.equal(caught.context.status, status);
    assert.equal(
      caught.message,
      `Hook process exited with status ${status}`,
      `${status} 无预览时应用状态消息`,
    );
  }
});

test("B8.4 有 stderr 预览 → diagnostics.stderrPreview 与 errorMessage 同值", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const result = parseHookOutcome(
    outcome({ status: "completed", exitCode: 0, stdout: '{"continue":true}', stderr: "warning" }),
    "PreToolUse",
  );

  assert.ok(result.diagnostics, "有 stderr 就应有 diagnostics");
  assert.equal(result.diagnostics.stderrPreview, "warning");
  assert.equal(result.diagnostics.errorMessage, "warning", "两者必须同值");
  assert.equal(result.diagnostics.stdoutPreview, undefined, "非 exit2 不带 stdoutPreview");
});

test("B8.4 无预览 → 不返回 diagnostics", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const result = parseHookOutcome(outcome({ stdout: '{"continue":true}' }), "PreToolUse");
  assert.equal(result.diagnostics, undefined);
});

test("B8.4 exitCode=2 时同时带 stdoutPreview", async () => {
  const { parseHookOutcome } = await loadPlugin();
  const result = parseHookOutcome(
    outcome({ status: "failed", exitCode: 2, stderr: "err", stdout: "out" }),
    "PreToolUse",
  );
  assert.equal(result.diagnostics.stderrPreview, "err");
  assert.equal(result.diagnostics.stdoutPreview, "out", "exit2 要带 stdout 预览");
});

test("B8.5 预览去首尾空白", async () => {
  const { toPreview } = await loadPlugin();
  assert.equal(toPreview("  hello  \n"), "hello");
});

test("B8.5 空字符串视为无预览", async () => {
  const { toPreview } = await loadPlugin();
  assert.equal(toPreview(""), undefined);
  assert.equal(toPreview("   \n\t "), undefined);
});

test("B8.5 4000 字符不截断（边界）", async () => {
  const { toPreview } = await loadPlugin();
  const exact = "x".repeat(4000);
  assert.equal(toPreview(exact), exact, "正好 4000 不截断");
});

test("B8.5 超过 4000 字符 → 前 4000 + '...'（总长 4003）", async () => {
  const { toPreview } = await loadPlugin();
  const long = "x".repeat(4001); // 4001 字符
  const preview = toPreview(long);

  assert.equal(preview.length, 4003, `应是 4000 + 3，实际：${preview.length}`);
  assert.ok(preview.endsWith("..."), "应以 ... 结尾");
  assert.equal(preview.slice(0, 4000), "x".repeat(4000), "前 4000 字符保留");
});

test("B8.5 超长文本截断后再去空白顺序正确", async () => {
  const { toPreview } = await loadPlugin();
  // 前后有空白 + 主体超长：应先 trim 再判断长度
  const value = `  ${"y".repeat(4001)}  `;
  const preview = toPreview(value);
  assert.equal(preview.length, 4003);
  assert.ok(preview.startsWith("y"), "trim 后再截断");
});
