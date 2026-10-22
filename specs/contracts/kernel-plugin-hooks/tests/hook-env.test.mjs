// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// hook-env 的契约测试（B2 的 6 条规格）。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/hook-env.ts");
}

function input(overrides = {}) {
  return { hookEventName: "PreToolUse", sessionId: "s1", ...overrides };
}

const plugin = {
  id: "p1",
  name: "Test Plugin",
  rootPath: "/plugins/p1",
  dataPath: "/data/p1",
};

test("B2.1 始终注入 5 个变量", async () => {
  const { createHookEnvOverlay } = await loadPlugin();
  const { set } = createHookEnvOverlay(undefined, input({ cwd: "/work" }), "/fallback");

  assert.equal(set.CLAUDE_CODE_SESSION_ID, "s1");
  assert.equal(set.CLAUDE_SESSION_ID, "s1");
  assert.equal(set.KNORVIA_SESSION_ID, "s1");
  assert.equal(set.CLAUDE_PROJECT_DIR, "/work");
  assert.equal(set.KNORVIA_PROJECT_DIR, "/work");
});

test("B2.1 cwd 缺失时用 workingDirectory", async () => {
  const { createHookEnvOverlay } = await loadPlugin();
  const { set } = createHookEnvOverlay(undefined, input(), "/fallback");

  assert.equal(set.CLAUDE_PROJECT_DIR, "/fallback");
  assert.equal(set.KNORVIA_PROJECT_DIR, "/fallback");
});

test("B2.2 有插件上下文时追加 6 个变量", async () => {
  const { createHookEnvOverlay } = await loadPlugin();
  const { set } = createHookEnvOverlay(plugin, input(), "/work");

  assert.equal(set.CLAUDE_PLUGIN_ROOT, "/plugins/p1");
  assert.equal(set.CLAUDE_PLUGIN_DATA, "/data/p1");
  assert.equal(set.KNORVIA_PLUGIN_ROOT, "/plugins/p1");
  assert.equal(set.KNORVIA_PLUGIN_DATA, "/data/p1");
  assert.equal(set.KNORVIA_PLUGIN_ID, "p1");
  assert.equal(set.KNORVIA_PLUGIN_NAME, "Test Plugin");
});

test("B2.2 无插件时只有 5 个变量", async () => {
  const { createHookEnvOverlay } = await loadPlugin();
  const { set } = createHookEnvOverlay(undefined, input(), "/work");

  assert.equal(Object.keys(set).length, 5, `应只有 5 个，实际：${Object.keys(set).join(",")}`);
  assert.equal("CLAUDE_PLUGIN_ROOT" in set, false);
});

test("B2.3 展开已知变量", async () => {
  const { expandHookVariables } = await loadPlugin();

  const result = expandHookVariables(
    "run --s=${KNORVIA_SESSION_ID} --p=${CLAUDE_PROJECT_DIR}",
    undefined,
    input({ cwd: "/w" }),
    "/fallback",
  );
  assert.equal(result, "run --s=s1 --p=/w");
});

test("B2.3 有插件时展开插件变量", async () => {
  const { expandHookVariables } = await loadPlugin();

  const result = expandHookVariables("${KNORVIA_PLUGIN_ROOT}/bin/x", plugin, input(), "/w");
  assert.equal(result, "/plugins/p1/bin/x");
});

test("B2.4 skill 变量必须抛错（不得静默展开为空串）", async () => {
  const { expandHookVariables, HookVariableError } = await loadPlugin();

  for (const variable of ["CLAUDE_SKILL_DIR", "KNORVIA_SKILL_DIR"]) {
    let caught;
    try {
      expandHookVariables(`x=\${${variable}}`, undefined, input(), "/w");
    } catch (error) {
      caught = error;
    }

    assert.ok(caught, `${variable} 必须抛错`);
    assert.equal(caught.name, "HookVariableError");
    assert.equal(caught.recoverable, true, "必须是可恢复错误");
    assert.equal(caught.variable, variable, "错误要带变量名");
    assert.equal(caught.hookEventName, "PreToolUse", "错误要带事件名");
    assert.ok(HookVariableError !== undefined);
  }
});

test("B2.5 未识别的 ${...} 原样保留", async () => {
  const { expandHookVariables } = await loadPlugin();

  const result = expandHookVariables(
    "a=${UNKNOWN_VAR} b=${ALSO_UNKNOWN}",
    undefined,
    input(),
    "/w",
  );
  assert.equal(result, "a=${UNKNOWN_VAR} b=${ALSO_UNKNOWN}");
});

test("B2.5 同一字符串多个变量全部替换", async () => {
  const { expandHookVariables } = await loadPlugin();

  const result = expandHookVariables(
    "${KNORVIA_SESSION_ID}:${CLAUDE_PROJECT_DIR}:${KNORVIA_PROJECT_DIR}",
    undefined,
    input({ cwd: "/x" }),
    "/w",
  );
  assert.equal(result, "s1:/x:/x");
});

test("B2.6 纯函数：相同入参恒等输出", async () => {
  const { expandHookVariables } = await loadPlugin();

  const first = expandHookVariables("${KNORVIA_SESSION_ID}", plugin, input(), "/w");
  const second = expandHookVariables("${KNORVIA_SESSION_ID}", plugin, input(), "/w");
  assert.equal(first, second);
});

test("B2.6 不读 process.env（注入同名环境变量也不影响）", async () => {
  const { expandHookVariables } = await loadPlugin();

  process.env.KNORVIA_SESSION_ID = "polluted";
  try {
    const result = expandHookVariables("${KNORVIA_SESSION_ID}", undefined, input(), "/w");
    assert.equal(result, "s1", "应使用输入值，不是 process.env");
  } finally {
    delete process.env.KNORVIA_SESSION_ID;
  }
});

test("环境与展开共享同一套来源（可展开变量与环境的取值一致）", async () => {
  const { createHookEnvOverlay, expandHookVariables } = await loadPlugin();
  const { set } = createHookEnvOverlay(plugin, input({ cwd: "/w" }), "/fallback");

  // ⚠️ 可展开变量清单（B2.3）与环境变量清单（B2.1/B2.2）**不是同一集合**：
  //    环境里有 KNORVIA_PLUGIN_ID / KNORVIA_PLUGIN_NAME，但它们**不可展开**。
  //    所以这里只对比「既可展开、也在环境里」的那些 —— 断言它们取值一致，
  //    从而防止「环境与展开两处推导漂移」。
  const expandable = [
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_SESSION_ID",
    "CLAUDE_PROJECT_DIR",
    "KNORVIA_SESSION_ID",
    "KNORVIA_PROJECT_DIR",
    "CLAUDE_PLUGIN_ROOT",
    "CLAUDE_PLUGIN_DATA",
    "KNORVIA_PLUGIN_ROOT",
    "KNORVIA_PLUGIN_DATA",
  ];

  for (const key of expandable) {
    assert.ok(key in set, `${key} 应在环境里`);
    const expanded = expandHookVariables(`\${${key}}`, plugin, input({ cwd: "/w" }), "/fallback");
    assert.equal(expanded, set[key], `${key} 的展开值应等于环境值`);
  }
});

test("环境里有但不可展开的变量：${...} 应原样保留", async () => {
  const { expandHookVariables } = await loadPlugin();

  // KNORVIA_PLUGIN_ID / KNORVIA_PLUGIN_NAME 在环境里，但 B2.3 的可展开清单不含它们。
  for (const key of ["KNORVIA_PLUGIN_ID", "KNORVIA_PLUGIN_NAME"]) {
    const expanded = expandHookVariables(`\${${key}}`, plugin, input(), "/w");
    assert.equal(expanded, `\${${key}}`, `${key} 不可展开，应原样保留`);
  }
});
