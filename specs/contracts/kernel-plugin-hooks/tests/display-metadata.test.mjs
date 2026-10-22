// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// display-metadata 的契约测试（B3 的 7 条规格）。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/display-metadata.ts");
}

const identity = (value) => value;

test("B3.1 process 类型：command + args 逐项渲染并用空格连接", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "process", command: "/usr/bin/hook", args: ["--x", "value"] },
    5000,
    identity,
  );
  assert.equal(descriptor.commandDisplay, "/usr/bin/hook --x value");
});

test("B3.1 安全字符的片段原样输出", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "process", command: "/a/b", args: ["x=y", "a.b", "a:b", "a@b", "50%", "a+b", "a,b"] },
    1000,
    identity,
  );
  assert.equal(descriptor.commandDisplay, "/a/b x=y a.b a:b a@b 50% a+b a,b");
});

test("B3.1 含空格的片段被 JSON.stringify 加引号", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "process", command: "/bin/x", args: ["hello world"] },
    1000,
    identity,
  );
  assert.equal(descriptor.commandDisplay, '/bin/x "hello world"');
});

test("B3.1 command 类型：展开后的 command 直接展示", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "command", command: "echo hi && ls" },
    1000,
    identity,
  );
  assert.equal(descriptor.commandDisplay, "echo hi && ls");
});

test("B3.1 commandDisplay 整体过脱敏（B4）", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "command", command: "deploy --api-key sk-secret-123" },
    1000,
    identity,
  );
  assert.equal(descriptor.commandDisplay.includes("sk-secret-123"), false, "凭据不能出现在展示里");
});

test("B3.1 expandDisplayValue 被逐项调用（process 的 command 与每个 arg）", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const seen = [];
  const expand = (value) => {
    seen.push(value);
    return value.toUpperCase();
  };
  createHookExecutionDescriptor(
    { type: "process", command: "cmd", args: ["a", "b"] },
    1000,
    expand,
  );
  assert.deepEqual(seen, ["cmd", "a", "b"], "每一项都应展开");
});

test("B3.2 有 plugin → sourceKind=plugin", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "command", command: "x", plugin: { id: "p1", name: "P" } },
    1000,
    identity,
  );
  assert.equal(descriptor.sourceKind, "plugin");
});

test("B3.2 无 plugin 但有 source.kind → 用 source.kind", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "command", command: "x", source: { kind: "user" } },
    1000,
    identity,
  );
  assert.equal(descriptor.sourceKind, "user");
});

test("B3.2 都没有 → internal", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "command", command: "x" },
    1000,
    identity,
  );
  assert.equal(descriptor.sourceKind, "internal");
});

test("B3.3 clientVisible = sourceKind !== internal", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();

  const internal = createHookExecutionDescriptor({ type: "command", command: "x" }, 1000, identity);
  assert.equal(internal.clientVisible, false);

  const user = createHookExecutionDescriptor(
    { type: "command", command: "x", source: { kind: "user" } },
    1000,
    identity,
  );
  assert.equal(user.clientVisible, true);
});

test("B3.4 command + async=true → background", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "command", command: "x", async: true },
    1000,
    identity,
  );
  assert.equal(descriptor.executionMode, "background");
});

test("B3.4 process + async=true → 仍是 foreground", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "process", command: "x", async: true },
    1000,
    identity,
  );
  assert.equal(descriptor.executionMode, "foreground", "process 即使写 async 也是前景");
});

test("B3.5 executionType = hook.type；timeoutMs 用传入值", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "process", command: "x" },
    7777,
    identity,
  );
  assert.equal(descriptor.executionType, "process");
  assert.equal(descriptor.timeoutMs, 7777);
});

test("B3.6 可选字段只在有值时出现", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "command", command: "x" },
    1000,
    identity,
  );
  assert.equal("pluginId" in descriptor, false);
  assert.equal("pluginName" in descriptor, false);
  assert.equal("sourcePath" in descriptor, false);
  assert.equal("statusMessage" in descriptor, false);
});

test("B3.6 有 plugin 时带 pluginId / pluginName", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const descriptor = createHookExecutionDescriptor(
    { type: "command", command: "x", plugin: { id: "p1", name: "Test" } },
    1000,
    identity,
  );
  assert.equal(descriptor.pluginId, "p1");
  assert.equal(descriptor.pluginName, "Test");
});

test("B3.6 sourcePath：插件优先，其次 hook.source.path", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();

  const fromPlugin = createHookExecutionDescriptor(
    {
      type: "command",
      command: "x",
      plugin: { id: "p", name: "P", sourcePath: "/from/plugin" },
      source: { path: "/from/source" },
    },
    1000,
    identity,
  );
  assert.equal(fromPlugin.sourcePath, "/from/plugin", "插件优先");

  const fromSource = createHookExecutionDescriptor(
    { type: "command", command: "x", source: { path: "/from/source" } },
    1000,
    identity,
  );
  assert.equal(fromSource.sourcePath, "/from/source");
});

test("B3.6 statusMessage 只在有值时出现", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const withMessage = createHookExecutionDescriptor(
    { type: "command", command: "x", statusMessage: "running" },
    1000,
    identity,
  );
  assert.equal(withMessage.statusMessage, "running");
});

test("B3.7 幂等：同样入参多次调用结果相等", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  const hook = { type: "process", command: "/bin/x", args: ["-a"] };
  const first = createHookExecutionDescriptor(hook, 1000, identity);
  const second = createHookExecutionDescriptor(hook, 1000, identity);
  assert.deepEqual(first, second);
});

test("B3.7 expandDisplayValue 抛错时不吞（向上传播）", async () => {
  const { createHookExecutionDescriptor } = await loadPlugin();
  let caught;
  try {
    createHookExecutionDescriptor({ type: "command", command: "${BAD}" }, 1000, () => {
      throw new Error("expand failed");
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "expand 抛错应向上传播");
  assert.equal(caught.message, "expand failed");
});
