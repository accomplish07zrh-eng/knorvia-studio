// SPDX-License-Identifier: Apache-2.0
// B3、B4：执行描述元数据与展示文本脱敏。
import assert from "node:assert/strict";
import test from "node:test";
import { hooks } from "./entry.mjs";
import { makeHookConfig } from "../fixtures/builders.mjs";

test("B3 process 类型逐段展开并按需加引号", () => {
  const descriptor = hooks.createHookExecutionDescriptor(
    makeHookConfig({ args: ["plain", "with space"], command: "/usr/bin/node" }),
    1000,
    (value) => value.replace("${ID}", "session-9"),
  );
  assert.equal(descriptor.commandDisplay, '/usr/bin/node plain "with space"');
  assert.equal(descriptor.executionType, "process");
  assert.equal(descriptor.executionMode, "foreground");
  assert.equal(descriptor.clientVisible, false);
  assert.equal(descriptor.sourceKind, "internal");
  assert.equal(descriptor.timeoutMs, 1000);

  const expanded = hooks.createHookExecutionDescriptor(
    makeHookConfig({ command: "echo", args: ["${ID}"] }),
    2000,
    (value) => value.replace("${ID}", "abc"),
  );
  assert.equal(expanded.commandDisplay, "echo abc");
});

test("B3 command 类型、后台模式与插件来源字段", () => {
  const descriptor = hooks.createHookExecutionDescriptor(
    {
      type: "command",
      command: "echo hi",
      async: true,
      statusMessage: "Running",
      plugin: {
        id: "demo",
        name: "Demo",
        rootPath: "/plugins/demo",
        dataPath: "/data/demo",
        sourcePath: "/plugins/demo/hooks.json",
      },
    },
    500,
  );
  assert.equal(descriptor.commandDisplay, "echo hi");
  assert.equal(descriptor.executionMode, "background");
  assert.equal(descriptor.sourceKind, "plugin");
  assert.equal(descriptor.clientVisible, true);
  assert.equal(descriptor.pluginId, "demo");
  assert.equal(descriptor.pluginName, "Demo");
  assert.equal(descriptor.sourcePath, "/plugins/demo/hooks.json");
  assert.equal(descriptor.statusMessage, "Running");
  assert.equal(descriptor.timeoutMs, 500);
});

test("B3 process 类型即使 async 也保持前景模式", () => {
  const descriptor = hooks.createHookExecutionDescriptor(makeHookConfig({ async: true }), 1000);
  assert.equal(descriptor.executionMode, "foreground");
});

test("B4 遮蔽 URL 凭据、authorization 头与敏感键值", () => {
  const masked = hooks.sanitizeHookDisplayText(
    'curl https://user:secret@example.com/hook -H "authorization: Bearer abc123" --api-key k-9 ' +
      "?access_token=tok&x=1 authorization = 'zzz' password=pw",
  );
  assert.ok(!masked.includes("user:secret"), masked);
  assert.ok(!masked.includes("abc123"), masked);
  assert.ok(!masked.includes("k-9"), masked);
  assert.ok(!masked.includes("access_token=tok"), masked);
  assert.ok(!masked.includes("zzz"), masked);
  assert.ok(!masked.includes("pw"), masked);
  assert.ok(masked.includes("https://••••:••••@example.com/hook"), masked);
  assert.ok(masked.includes("?access_token=••••"), masked);
});

test("B4 只遮蔽秘密，保留普通命令与 URL 其余部分", () => {
  const plain = "node hooks/check.mjs --verbose https://example.com/api/v1?page=2";
  assert.equal(hooks.sanitizeHookDisplayText(plain), plain);
  assert.equal(hooks.sanitizeHookDisplayText(""), "");
});
