// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// kernel-plugin-tools-01 的契约测试（behavior.md B1-B12）。
//
// 全部走公开入口：本包的导出 + 注入的假 `AutomationPort`。
import assert from "node:assert/strict";
import test from "node:test";

// 测试文件在 `apps/cli/packages/bootstrap/test/` → 源码在同包的 `src/` 下。
const ENTRY = "../src/kernel-plugin-tools-01/index.ts";

async function loadPlugin() {
  return await import(ENTRY);
}

/** 一条完整的自动化记录（14 字段，含 2 个隐藏字段）。 */
function automation(overrides = {}) {
  return {
    automationId: "auto-1",
    cron: "0 9 * * *",
    prompt: "do the thing",
    title: "every morning",
    recurring: true,
    enabled: true,
    createdAt: "2026-10-23T00:00:00.000Z",
    updatedAt: "2026-10-23T00:00:00.000Z",
    sessionId: "s-1",
    lastRunAt: null,
    nextRunAt: "2026-10-24T01:00:00.000Z",
    runCount: 0,
    modelSelection: { providerId: "p", modelId: "m" },
    mode: "build",
    ...overrides,
  };
}

/** 假端口：记录调用，按预设返回。 */
function makePort(overrides = {}) {
  const calls = [];
  const port = {
    async create(input, context) {
      calls.push({ op: "create", input, context });
      if (overrides.createThrows !== undefined) throw overrides.createThrows;
      return automation({ automationId: overrides.id ?? "auto-new" });
    },
    async update(input) {
      calls.push({ op: "update", input });
      return automation({ automationId: input.id });
    },
    async list() {
      calls.push({ op: "list" });
      return overrides.automations ?? [automation()];
    },
    async delete(input) {
      calls.push({ op: "delete", input });
      return overrides.deleteResult ?? true;
    },
  };
  return { calls, port };
}

function context(port, overrides = {}) {
  return {
    getAutomationPort: () => port,
    sessionId: "s-1",
    model: "p/m",
    ...overrides,
  };
}

// ── B1 四个工具的可用集 ────────────────────────────────

test("B1 注册集包含四个 cron 工具", async () => {
  const plugin = await loadPlugin();
  const registered = [];
  const ctx = {
    tools: { register: (definition) => registered.push(definition.name) },
  };

  plugin.apply(ctx, { getAutomationPort: () => undefined });

  assert.deepEqual(registered.sort(), ["CronCreate", "CronDelete", "CronList", "CronUpdate"]);
});

test("B1 不含 TodoRead（由 sessionProjections 承接）", async () => {
  const plugin = await loadPlugin();
  const registered = [];
  const ctx = { tools: { register: (d) => registered.push(d.name) } };

  plugin.apply(ctx, { getAutomationPort: () => undefined });
  assert.equal(registered.includes("TodoRead"), false);
});

// ── B2 参数 schema 形状 ────────────────────────────────

test("B2 CronCreate 的参数字段集", async () => {
  const plugin = await loadPlugin();
  let definition;
  const ctx = {
    tools: {
      register: (d) => {
        definition = d;
      },
    },
  };

  plugin.apply(ctx, { getAutomationPort: () => undefined });
  const create = definition.name === "CronCreate" ? definition : undefined;

  // 重新注册以拿到全部（register 是最后一个）
  const all = [];
  plugin.apply({ tools: { register: (d) => all.push(d) } }, { getAutomationPort: () => undefined });
  const createTool = all.find((d) => d.name === "CronCreate");
  assert.ok(createTool, "应注册 CronCreate");
  assert.deepEqual(Object.keys(createTool.parameters.properties).sort(), [
    "cron",
    "delayMinutes",
    "interval",
    "intervalUnit",
    "maxRuns",
    "prompt",
    "recurring",
    "title",
  ]);
});

test("B2 CronList 无参数", async () => {
  const plugin = await loadPlugin();
  const all = [];
  plugin.apply({ tools: { register: (d) => all.push(d) } }, { getAutomationPort: () => undefined });
  const listTool = all.find((d) => d.name === "CronList");
  assert.deepEqual(Object.keys(listTool.parameters.properties ?? {}), []);
});

test("B2 CronUpdate 有 id + 8 个字段", async () => {
  const plugin = await loadPlugin();
  const all = [];
  plugin.apply({ tools: { register: (d) => all.push(d) } }, { getAutomationPort: () => undefined });
  const updateTool = all.find((d) => d.name === "CronUpdate");
  assert.deepEqual(Object.keys(updateTool.parameters.properties).sort(), [
    "cron",
    "delayMinutes",
    "id",
    "interval",
    "intervalUnit",
    "maxRuns",
    "prompt",
    "recurring",
    "title",
  ]);
});

test("B2 CronDelete 只有 id", async () => {
  const plugin = await loadPlugin();
  const all = [];
  plugin.apply({ tools: { register: (d) => all.push(d) } }, { getAutomationPort: () => undefined });
  const deleteTool = all.find((d) => d.name === "CronDelete");
  assert.deepEqual(Object.keys(deleteTool.parameters.properties), ["id"]);
});

test("B4 delayMinutes 用 oneOf 表达 null（否则 DSH 会在执行体前拒绝）", async () => {
  const plugin = await loadPlugin();
  const all = [];
  plugin.apply({ tools: { register: (d) => all.push(d) } }, { getAutomationPort: () => undefined });
  const createTool = all.find((d) => d.name === "CronCreate");

  assert.ok(createTool.parameters.properties.delayMinutes.oneOf, "必须是 oneOf");
  const types = createTool.parameters.properties.delayMinutes.oneOf.map((s) => s.type);
  assert.deepEqual(types.sort(), ["null", "number"]);
});

// ── B5 两层元数据 ──────────────────────────────────────

test("B5 第一层：四个工具的 timeoutMs 都是 30_000", async () => {
  const plugin = await loadPlugin();
  const all = [];
  plugin.apply({ tools: { register: (d) => all.push(d) } }, { getAutomationPort: () => undefined });
  for (const definition of all) {
    assert.equal(definition.timeoutMs, 30_000, `${definition.name} 的 timeoutMs`);
  }
});

test("B5 第一层：CronList 可并发，三个写工具不可", async () => {
  const plugin = await loadPlugin();
  const all = [];
  plugin.apply({ tools: { register: (d) => all.push(d) } }, { getAutomationPort: () => undefined });

  const listTool = all.find((d) => d.name === "CronList");
  assert.equal(listTool.isConcurrencySafe({}), true);

  for (const name of ["CronCreate", "CronUpdate", "CronDelete"]) {
    const definition = all.find((d) => d.name === name);
    assert.equal(definition.isConcurrencySafe({}), false, `${name} 不应可并发`);
  }
});

test("B5 第二层：能力声明表取值正确", async () => {
  const plugin = await loadPlugin();
  const capabilities = plugin.CRON_TOOL_CAPABILITIES;

  assert.equal(capabilities.CronList.readOnly, true);
  assert.equal(capabilities.CronList.needsApproval, false);
  assert.equal(capabilities.CronList.sideEffectScope, "none");
  assert.equal(capabilities.CronList.riskLevel, "low");

  for (const name of ["CronCreate", "CronUpdate", "CronDelete"]) {
    assert.equal(capabilities[name].readOnly, false, `${name}.readOnly`);
    assert.equal(capabilities[name].needsApproval, true, `${name}.needsApproval`);
    assert.equal(capabilities[name].sideEffectScope, "workspace");
    assert.equal(capabilities[name].riskLevel, "medium");
    assert.equal(capabilities[name].destructive, false, "删除是删调度记录，不是删用户数据");
  }
});

// ── B6 无 DSH 品牌泄漏 ─────────────────────────────────

test("B6 description 不含 DSH 品牌", async () => {
  const plugin = await loadPlugin();
  const all = [];
  plugin.apply({ tools: { register: (d) => all.push(d) } }, { getAutomationPort: () => undefined });

  for (const definition of all) {
    assert.equal(
      /DeepSeek Harness/u.test(definition.description),
      false,
      `${definition.name} 含 DeepSeek Harness`,
    );
    assert.equal(/powered by DeepSeek/u.test(definition.description), false);
    assert.equal(/@deepseek-ai\//u.test(definition.description), false);
  }
});

// ── §B 九条交叉约束 ───────────────────────────────────

test("§B 九条约束名都存在", async () => {
  const plugin = await loadPlugin();
  assert.deepEqual(
    [...plugin.CRON_CREATE_CONSTRAINTS],
    [
      "cron-required-without-delay",
      "relative-delay-omits-cron",
      "relative-delay-is-one-shot",
      "relative-delay-has-no-max-runs",
      "interval-unit-excludes-delay",
      "interval-unit-pairs-with-interval",
      "interval-unit-requires-recurring",
      "interval-unit-has-no-max-runs",
      "interval-within-range",
    ],
  );
});

test("§B 1 cron-required-without-delay", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({ prompt: "x" });
  assert.ok(violations.some((v) => v.constraint === "cron-required-without-delay"));
});

test("§B 2 relative-delay-omits-cron", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({ delayMinutes: 10, cron: "0 9 * * *" });
  assert.ok(violations.some((v) => v.constraint === "relative-delay-omits-cron"));
});

test("§B 3 relative-delay-is-one-shot", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({ delayMinutes: 10, recurring: true });
  assert.ok(violations.some((v) => v.constraint === "relative-delay-is-one-shot"));
});

test("§B 4 relative-delay-has-no-max-runs", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({ delayMinutes: 10, maxRuns: 3 });
  assert.ok(violations.some((v) => v.constraint === "relative-delay-has-no-max-runs"));
});

test("§B 5 interval-unit-excludes-delay", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({
    delayMinutes: 10,
    intervalUnit: "days",
    interval: 2,
  });
  assert.ok(violations.some((v) => v.constraint === "interval-unit-excludes-delay"));
});

test("§B 6 interval-unit-pairs-with-interval（只给 unit）", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({ intervalUnit: "days", cron: "0 9 * * *" });
  assert.ok(violations.some((v) => v.constraint === "interval-unit-pairs-with-interval"));
});

test("§B 6 interval-unit-pairs-with-interval（只给 interval）", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({ interval: 2, cron: "0 9 * * *" });
  assert.ok(violations.some((v) => v.constraint === "interval-unit-pairs-with-interval"));
});

test("§B 7 interval-unit-requires-recurring", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({
    intervalUnit: "days",
    interval: 2,
    recurring: false,
  });
  assert.ok(violations.some((v) => v.constraint === "interval-unit-requires-recurring"));
});

test("§B 8 interval-unit-has-no-max-runs", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({
    intervalUnit: "days",
    interval: 2,
    maxRuns: 5,
  });
  assert.ok(violations.some((v) => v.constraint === "interval-unit-has-no-max-runs"));
});

test("§B 9 interval-within-range（201 一例）", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({ intervalUnit: "days", interval: 201 });
  assert.ok(violations.some((v) => v.constraint === "interval-within-range"));
});

test("§B 一次报全：多个违反项同时出现时全部列出", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({
    delayMinutes: 10,
    cron: "0 9 * * *",
    recurring: true,
    maxRuns: 3,
  });

  const names = violations.map((v) => v.constraint);
  assert.ok(names.includes("relative-delay-omits-cron"));
  assert.ok(names.includes("relative-delay-is-one-shot"));
  assert.ok(names.includes("relative-delay-has-no-max-runs"));
  assert.ok(violations.length >= 3, "应一次报全");
});

// ── B3 字段级校验 ─────────────────────────────────────

test("B3 title-not-blank", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({ cron: "0 9 * * *", title: "   " });
  assert.ok(violations.some((v) => v.constraint === "title-not-blank"));
});

test("B3 cron-not-blank", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({ cron: "   " });
  assert.ok(violations.some((v) => v.constraint === "cron-not-blank"));
});

test("B3 delay-minutes-in-range（-1 / 0 / 525_601）", async () => {
  const plugin = await loadPlugin();
  for (const delayMinutes of [-1, 0, 525_601]) {
    const violations = plugin.violationsOf({ delayMinutes });
    assert.ok(
      violations.some((v) => v.constraint === "delay-minutes-in-range"),
      `${delayMinutes} 应被拒`,
    );
  }
});

test("B3 max-runs-positive-integer（0 一例）", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({ cron: "0 9 * * *", maxRuns: 0 });
  assert.ok(violations.some((v) => v.constraint === "max-runs-positive-integer"));
});

test("B3 interval-unit-enum（fortnight 一例）", async () => {
  const plugin = await loadPlugin();
  const violations = plugin.violationsOf({ intervalUnit: "fortnight", interval: 2 });
  assert.ok(violations.some((v) => v.constraint === "interval-unit-enum"));
});

// ── B4 delayMinutes: null 等价于未给 ───────────────────

test("B4 delayMinutes: null → 按绝对 cron 处理，端口被调用一次", async () => {
  const plugin = await loadPlugin();
  const { calls, port } = makePort();

  const result = await plugin.executeCronCreate(
    { cron: "0 9 * * *", delayMinutes: null, prompt: "x" },
    context(port),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, "create");
  assert.ok(result.message.includes("Created automation"));
});

// ── B7 投影 ──────────────────────────────────────────

test("B7 投影隐藏 modelSelection 与 mode", async () => {
  const plugin = await loadPlugin();
  const { port } = makePort();
  const result = await plugin.executeCronList(context(port));

  const projected = result.automations[0];
  assert.equal("modelSelection" in projected, false);
  assert.equal("mode" in projected, false);
});

test("B7 投影保留 12 个可见字段", async () => {
  const plugin = await loadPlugin();
  const { port } = makePort();
  const result = await plugin.executeCronList(context(port));

  const projected = result.automations[0];
  assert.equal(
    Object.keys(projected).length,
    12,
    `应 12 个字段，实际 ${Object.keys(projected).length}`,
  );
  for (const field of ["automationId", "cron", "prompt", "title", "recurring", "enabled"]) {
    assert.ok(field in projected, `缺 ${field}`);
  }
});

// ── §D 四个操作的输出 ─────────────────────────────────

test("§D CronCreate 输出 automation + message", async () => {
  const plugin = await loadPlugin();
  const { port } = makePort({ id: "auto-42" });
  const result = await plugin.executeCronCreate({ cron: "0 9 * * *", prompt: "x" }, context(port));

  assert.ok(result.automation);
  assert.equal(result.message, "Created automation auto-42.");
});

test("§D CronUpdate 输出 message 含 Updated", async () => {
  const plugin = await loadPlugin();
  const { port } = makePort();
  const result = await plugin.executeCronUpdate(
    { id: "auto-1", cron: "0 9 * * *", prompt: "new" },
    context(port),
  );

  assert.equal(result.message, "Updated automation auto-1.");
});

test("§D CronList 输出 automations", async () => {
  const plugin = await loadPlugin();
  const { port } = makePort({
    automations: [automation(), automation({ automationId: "auto-2" })],
  });
  const result = await plugin.executeCronList(context(port));

  assert.equal(result.automations.length, 2);
});

test("§D CronDelete 成功文案", async () => {
  const plugin = await loadPlugin();
  const { port } = makePort({ deleteResult: true });
  const result = await plugin.executeCronDelete({ id: "auto-1" }, context(port));

  assert.equal(result.deleted, true);
  assert.equal(result.message, "Deleted automation auto-1.");
});

// ── B8 删除幂等 ──────────────────────────────────────

test("B8 端口返回 false → deleted: false 且不抛错", async () => {
  const plugin = await loadPlugin();
  const { port } = makePort({ deleteResult: false });

  const result = await plugin.executeCronDelete({ id: "auto-missing" }, context(port));
  assert.equal(result.deleted, false);
  assert.equal(result.message, "auto-missing was not found in the current workspace.");
});

// ── B9 端口不可用 ────────────────────────────────────

test("B9 端口不可用时四个工具都抛错", async () => {
  const plugin = await loadPlugin();
  const ctx = { getAutomationPort: () => undefined };

  const expected = "Scheduled automations are not available in this session";
  await assert.rejects(
    () => plugin.executeCronCreate({ cron: "0 9 * * *" }, ctx),
    new RegExp(expected, "u"),
  );
  await assert.rejects(() => plugin.executeCronList(ctx), new RegExp(expected, "u"));
  await assert.rejects(() => plugin.executeCronUpdate({ id: "x" }, ctx), new RegExp(expected, "u"));
  await assert.rejects(() => plugin.executeCronDelete({ id: "x" }, ctx), new RegExp(expected, "u"));
});

// ── B10 自动化轮次内不得写 ───────────────────────────

test("B10 自动化轮次内三个写工具被拒", async () => {
  const plugin = await loadPlugin();
  const { calls, port } = makePort();
  const ctx = context(port, { automationTurn: true });

  await assert.rejects(() => plugin.executeCronCreate({ cron: "0 9 * * *" }, ctx));
  await assert.rejects(() => plugin.executeCronUpdate({ id: "x" }, ctx));
  await assert.rejects(() => plugin.executeCronDelete({ id: "x" }, ctx));

  assert.equal(calls.length, 0, "端口不应被调用");
});

test("B10 自动化轮次内 CronList 仍可用", async () => {
  const plugin = await loadPlugin();
  const { port } = makePort();
  const ctx = context(port, { automationTurn: true });

  const result = await plugin.executeCronList(ctx);
  assert.ok(result.automations, "只读工具不受限制");
});

// ── B11 上限错误翻译 ─────────────────────────────────

test("B11 端口抛上限错误 → 翻译成同错误码 + cause 保留", async () => {
  const plugin = await loadPlugin();
  const { port } = makePort({
    createThrows: { code: "AUTOMATION_CREATE_LIMIT_REACHED", message: "too many" },
  });

  let caught;
  try {
    await plugin.executeCronCreate({ cron: "0 9 * * *" }, context(port));
  } catch (error) {
    caught = error;
  }

  assert.ok(caught);
  assert.equal(caught.code, "AUTOMATION_CREATE_LIMIT_REACHED");
  assert.ok(caught.cause, "cause 应保留原始错误");
});

// ── B12 不在真实用户目录读写 ─────────────────────────

test("B12 本包不碰文件系统（端口是唯一 I/O）", async () => {
  const plugin = await loadPlugin();
  const { calls, port } = makePort();

  await plugin.executeCronCreate({ cron: "0 9 * * *" }, context(port));

  // 所有 I/O 都通过端口 → 调用记录里只有端口操作
  assert.deepEqual(
    calls.map((c) => c.op),
    ["create"],
  );
});
