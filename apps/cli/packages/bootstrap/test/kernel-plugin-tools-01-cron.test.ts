// SPDX-License-Identifier: Apache-2.0
// cron 族四个工具的契约测试。
//
// 覆盖合同 behavior.md 的 B1–B5 / B10 / B12 条目。
// 全部走**公开入口**（插件 `apply` + DSH 的 `ctx.tools`），不 import 实现内部函数，
// 这样测试断言的是「工具在注册表上的可观察行为」，而不是「某个函数怎么写的」。
import assert from "node:assert/strict";
import test from "node:test";
import type { AutomationPort, CronAutomation, CronCreateInput } from "@knorvia/contracts";
import { apply, type KernelPluginToolsConfig } from "../src/kernel-plugin-tools-01/index.js";

/** 一份完整的任务记录（14 字段，含两个不给模型看的）。 */
function automationOf(overrides: Partial<CronAutomation> = {}): CronAutomation {
  return {
    automationId: "fixture-automation",
    title: "每 20 分钟喝水提醒",
    cronExpr: "*/20 * * * *",
    prompt: "提醒用户喝水。",
    enabled: true,
    lifecycleStatus: "active",
    runCount: 0,
    recurring: true,
    modelSelection: { providerId: "fixture-provider", modelId: "fixture-model" },
    mode: "build",
    ...overrides,
  } as CronAutomation;
}

/** 记录调用的假端口。 */
function fakePort(overrides: Partial<AutomationPort> = {}): {
  port: AutomationPort;
  calls: Array<{ op: string; input: unknown; context: unknown }>;
} {
  const calls: Array<{ op: string; input: unknown; context: unknown }> = [];
  const port: AutomationPort = {
    create: async (input, context) => {
      calls.push({ op: "create", input, context });
      return automationOf();
    },
    update: async (input) => {
      calls.push({ op: "update", input, context: undefined });
      return automationOf();
    },
    list: async () => {
      calls.push({ op: "list", input: undefined, context: undefined });
      return [automationOf()];
    },
    delete: async (input) => {
      calls.push({ op: "delete", input, context: undefined });
      return true;
    },
    ...overrides,
  };
  return { port, calls };
}

/** 一个最小的 `ctx` 桩：只提供 `tools.register`。 */
function fakeContext(): {
  ctx: { tools: { register(definition: unknown): void } };
  registered: unknown[];
} {
  const registered: unknown[] = [];
  return {
    ctx: { tools: { register: (definition: unknown) => registered.push(definition) } },
    registered,
  };
}

/** 把已注册的工具定义按名字索引。 */
function byName(registered: unknown[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const definition of registered) {
    const record = definition as Record<string, unknown>;
    map.set(String(record.name), record);
  }
  return map;
}

/** 建好插件并返回注册结果。 */
function mount(port: AutomationPort | undefined): {
  tools: Map<string, Record<string, unknown>>;
  config: KernelPluginToolsConfig;
} {
  const { ctx, registered } = fakeContext();
  const config: KernelPluginToolsConfig = {
    getAutomationPort: () => port,
    sessionIdOf: () => "fixture-session",
    modelOf: () => "fixture-provider/fixture-model",
  };
  apply(ctx as never, config);
  return { tools: byName(registered), config };
}

/** 一个最小的执行上下文（DSH 的 ToolRunContext 在测试里只需 signal）。 */
function execOf(overrides: Record<string, unknown> = {}): never {
  return {
    signal: new AbortController().signal,
    ...overrides,
  } as never;
}

// ── B1 可用集 ─────────────────────────────────────────────────────────────

test("B1 注册四个 cron 工具，且不含 TodoRead", () => {
  const { tools } = mount(fakePort().port);
  assert.deepEqual([...tools.keys()].sort(), [
    "CronCreate",
    "CronDelete",
    "CronList",
    "CronUpdate",
  ]);
  assert.equal(tools.has("TodoRead"), false);
});

test("B1 每个工具都有 description、parameters 与 execute", () => {
  const { tools } = mount(fakePort().port);
  for (const [name, tool] of tools) {
    assert.equal(typeof tool.description, "string", `${name} 缺 description`);
    assert.ok(String(tool.description).length > 0, `${name} description 为空`);
    assert.equal(typeof tool.parameters, "object", `${name} 缺 parameters`);
    assert.equal(typeof tool.execute, "function", `${name} 缺 execute`);
    assert.equal(typeof tool.output, "object", `${name} 缺 output`);
  }
});

// ── B2 参数 schema 形状 ──────────────────────────────────────────────────

test("B2 CronCreate 声明八个参数字段；CronDelete 只要 id", () => {
  const { tools } = mount(fakePort().port);
  // DSH 的 `defineTool` 会把 per-property 的 `parameters` 编译成「隐式开放对象根」
  // （`{ type: "object", properties: {...} }`），所以断言要读 `properties`。
  const fieldsOf = (name: string): string[] => {
    const parameters = tools.get(name)!.parameters as {
      properties?: Record<string, unknown>;
    };
    return Object.keys(parameters.properties ?? {}).sort();
  };
  assert.deepEqual(fieldsOf("CronCreate"), [
    "cron",
    "delayMinutes",
    "interval",
    "intervalUnit",
    "maxRuns",
    "prompt",
    "recurring",
    "title",
  ]);
  assert.deepEqual(fieldsOf("CronDelete"), ["id"]);
  assert.deepEqual(fieldsOf("CronList"), []);
  assert.deepEqual(fieldsOf("CronUpdate").length, 9);
});

// ── B3/B4 CronCreate 的九条交叉约束 ──────────────────────────────────────

test("B4 缺 cron 且无 delayMinutes → 拒绝且不调端口", async () => {
  const { port, calls } = fakePort();
  const { tools } = mount(port);
  const create = tools.get("CronCreate")!;
  await assert.rejects(
    () => (create.execute as Function)({ prompt: "p", title: "t" }, execOf()),
    /cron-required-without-delay/u,
  );
  assert.equal(calls.length, 0);
});

test("B4 相对延迟与 cron 同传 → 拒绝", async () => {
  const { port, calls } = fakePort();
  const { tools } = mount(port);
  await assert.rejects(
    () =>
      (tools.get("CronCreate")!.execute as Function)(
        { prompt: "p", title: "t", delayMinutes: 8, cron: "*/20 * * * *" },
        execOf(),
      ),
    /relative-delay-omits-cron/u,
  );
  assert.equal(calls.length, 0);
});

test("B4 相对延迟与 recurring=true 同传 → 拒绝", async () => {
  const { tools } = mount(fakePort().port);
  await assert.rejects(
    () =>
      (tools.get("CronCreate")!.execute as Function)(
        { prompt: "p", title: "t", delayMinutes: 8, recurring: true },
        execOf(),
      ),
    /relative-delay-is-one-shot/u,
  );
});

test("B4 intervalUnit 与 interval 必须配对", async () => {
  const { tools } = mount(fakePort().port);
  await assert.rejects(
    () =>
      (tools.get("CronCreate")!.execute as Function)(
        { prompt: "p", title: "t", cron: "* * * * *", intervalUnit: "minute" },
        execOf(),
      ),
    /interval-unit-pairs-with-interval/u,
  );
});

test("B4 interval 超范围 → 拒绝", async () => {
  const { tools } = mount(fakePort().port);
  await assert.rejects(
    () =>
      (tools.get("CronCreate")!.execute as Function)(
        {
          prompt: "p",
          title: "t",
          cron: "* * * * *",
          intervalUnit: "minute",
          interval: 201,
        },
        execOf(),
      ),
    /interval-within-range/u,
  );
});

test("B4 合法的绝对 cron 创建成功，并把会话与模型传给端口", async () => {
  const { port, calls } = fakePort();
  const { tools } = mount(port);
  const result = await (tools.get("CronCreate")!.execute as Function)(
    { prompt: "提醒喝水", title: "每 20 分钟喝水提醒", cron: "*/20 * * * *" },
    execOf(),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.op, "create");
  assert.deepEqual(calls[0]!.context, {
    model: "fixture-provider/fixture-model",
    sessionId: "fixture-session",
  });
  assert.match(String((result as { message: string }).message), /Created automation/u);
});

// ── B5 投影：不给模型看 modelSelection / mode ────────────────────────────

test("B5 创建结果不含 modelSelection 与 mode", async () => {
  const { tools } = mount(fakePort().port);
  const result = (await (tools.get("CronCreate")!.execute as Function)(
    { prompt: "p", title: "t", cron: "*/20 * * * *" },
    execOf(),
  )) as { automation: Record<string, unknown> };
  assert.equal("modelSelection" in result.automation, false);
  assert.equal("mode" in result.automation, false);
  assert.equal(result.automation.automationId, "fixture-automation");
});

test("B5 CronList 的每条记录同样不含两个内部字段", async () => {
  const { tools } = mount(fakePort().port);
  const result = (await (tools.get("CronList")!.execute as Function)({}, execOf())) as {
    automations: Array<Record<string, unknown>>;
  };
  assert.equal(result.automations.length, 1);
  assert.equal("modelSelection" in result.automations[0]!, false);
  assert.equal("mode" in result.automations[0]!, false);
});

// ── B4 CronDelete 的幂等语义 ─────────────────────────────────────────────

test("B5 删除不存在的任务返回 deleted=false 而不是抛错", async () => {
  const { port } = fakePort({ delete: async () => false });
  const { tools } = mount(port);
  const result = (await (tools.get("CronDelete")!.execute as Function)(
    { id: "missing-automation" },
    execOf(),
  )) as { deleted: boolean; id: string; message: string };
  assert.equal(result.deleted, false);
  assert.equal(result.id, "missing-automation");
  assert.match(result.message, /was not found/u);
});

test("B5 删除成功的文案含任务 id", async () => {
  const { tools } = mount(fakePort().port);
  const result = (await (tools.get("CronDelete")!.execute as Function)(
    { id: "fixture-automation" },
    execOf(),
  )) as { deleted: boolean; message: string };
  assert.equal(result.deleted, true);
  assert.match(result.message, /Deleted automation fixture-automation\./u);
});

// ── B11 端口不可用时不放行 ───────────────────────────────────────────────

test("B11 端口不可用时四个工具都明确失败，不返回空成功", async () => {
  const { tools } = mount(undefined);
  for (const name of ["CronCreate", "CronList", "CronUpdate", "CronDelete"]) {
    const args =
      name === "CronCreate"
        ? { prompt: "p", title: "t", cron: "*/20 * * * *" }
        : name === "CronUpdate"
          ? { id: "x", title: "y" }
          : name === "CronDelete"
            ? { id: "x" }
            : {};
    await assert.rejects(
      () => (tools.get(name)!.execute as Function)(args, execOf()),
      /not available in this session/u,
      `${name} 在端口缺席时应失败`,
    );
  }
});

// ── B12 无 DSH 品牌泄漏 ─────────────────────────────────────────────────

test("B12 工具描述里没有 DSH 品牌字样", () => {
  const { tools } = mount(fakePort().port);
  for (const [name, tool] of tools) {
    const description = String(tool.description);
    for (const banned of ["DeepSeek Harness", "powered by DeepSeek", "@deepseek-ai/"]) {
      assert.equal(description.includes(banned), false, `${name} 的描述含禁用字样 ${banned}`);
    }
  }
});

// ── 自动化轮次内不得创建 ─────────────────────────────────────────────────

test("B13 自动化轮次内调用写工具被拒绝", async () => {
  const { port, calls } = fakePort();
  const { tools } = mount(port);
  const automationExec = execOf({ metadata: { automationTurn: true } });
  await assert.rejects(
    () =>
      (tools.get("CronCreate")!.execute as Function)(
        { prompt: "p", title: "t", cron: "*/20 * * * *" },
        automationExec,
      ),
    /cannot run inside a scheduled automation turn/u,
  );
  assert.equal(calls.length, 0);
});

test("B13 自动化轮次内 CronList 仍然可用（只读）", async () => {
  const { port, calls } = fakePort();
  const { tools } = mount(port);
  await (tools.get("CronList")!.execute as Function)(
    {},
    execOf({ metadata: { automationTurn: true } }),
  );
  assert.equal(calls.length, 1);
});

// ── 字段级校验（DSH schema 无 min/max，必须在执行体补）──────────────────

test("B2 空白 title / cron 被拒绝", async () => {
  const { port, calls } = fakePort();
  const { tools } = mount(port);
  for (const args of [
    { prompt: "p", title: "   ", cron: "*/20 * * * *" },
    { prompt: "p", title: "t", cron: "  " },
  ]) {
    await assert.rejects(
      () => (tools.get("CronCreate")!.execute as Function)(args, execOf()),
      /must not be blank/u,
    );
  }
  assert.equal(calls.length, 0);
});

test("B2 delayMinutes 负数、零、超上限都被拒绝", async () => {
  const { port, calls } = fakePort();
  const { tools } = mount(port);
  for (const delayMinutes of [-1, 0, 525_601]) {
    await assert.rejects(
      () =>
        (tools.get("CronCreate")!.execute as Function)(
          { prompt: "p", title: "t", delayMinutes },
          execOf(),
        ),
      /delay-minutes-in-range/u,
    );
  }
  assert.equal(calls.length, 0);
});

test("B2 maxRuns 非正整数被拒绝", async () => {
  const { port, calls } = fakePort();
  const { tools } = mount(port);
  await assert.rejects(
    () =>
      (tools.get("CronCreate")!.execute as Function)(
        { prompt: "p", title: "t", cron: "* * * * *", recurring: false, maxRuns: 0 },
        execOf(),
      ),
    /max-runs-positive-integer/u,
  );
  assert.equal(calls.length, 0);
});

test("B2 intervalUnit 非枚举值被拒绝", async () => {
  const { port, calls } = fakePort();
  const { tools } = mount(port);
  await assert.rejects(
    () =>
      (tools.get("CronCreate")!.execute as Function)(
        {
          prompt: "p",
          title: "t",
          cron: "* * * * *",
          intervalUnit: "fortnight",
          interval: 2,
        },
        execOf(),
      ),
    /interval-unit-enum/u,
  );
  assert.equal(calls.length, 0);
});

test("B4 delayMinutes 为 null 时按「非相对」处理（兼容旧调用方）", async () => {
  const { port, calls } = fakePort();
  const { tools } = mount(port);
  await (tools.get("CronCreate")!.execute as Function)(
    { prompt: "p", title: "t", cron: "*/20 * * * *", delayMinutes: null },
    execOf(),
  );
  assert.equal(calls.length, 1);
});
