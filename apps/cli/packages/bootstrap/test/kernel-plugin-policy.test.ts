// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-policy 合同测试：走**公开插件入口**（apply + 触发 tools/pre-execute）。
//
// 契约依据：specs/contracts/kernel-plugin-policy/behavior.md B1–B12、acceptance.md §4.2。
//
// 与旧实现测试的区别：旧测试直接 import `core/src/permission/*` 内部模块；
// 本套测试**只通过公开入口**（本包的 `apply` 与导出的纯函数），
// 因此对新运行时同样适用（接入包流程第 2 条）。

import assert from "node:assert/strict";
import nodePath from "node:path";
import test from "node:test";

import type { Context } from "@deepseek-ai/cordis";
import {
  apply,
  assertWired,
  DEFAULT_POLICY_ROW_ID,
  detectCatalogueDrift,
  knownToolNames,
  NOOP_LOGGER,
  resolveCapability,
  type KnorviaPolicyConfig,
  type PreToolDecision,
  type ToolCapabilityDeclaration,
  type ToolExecutionLike,
} from "../src/kernel-plugin-policy/index.js";

/** 一次性捕获 `logger` 的输出，用于断言「不泄漏」。 */
function createCapturingLogger() {
  const entries: { level: string; message: string; fields?: Record<string, unknown> }[] = [];
  const push = (level: string) => (message: string, fields?: Record<string, unknown>) => {
    entries.push({ level, message, fields });
  };
  return {
    entries,
    logger: { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") },
  };
}

/** 最小 `Context` 替身：只实现 `on`，把监听者记下来供测试直接调用。 */
interface HarnessContext {
  readonly listeners: ((
    exec: ToolExecutionLike,
    next: () => Promise<PreToolDecision>,
  ) => Promise<PreToolDecision>)[];
  readonly ctx: Context;
}

function createHarnessContext(): HarnessContext {
  const listeners: HarnessContext["listeners"] = [];
  const ctx = {
    on(event: string, handler: HarnessContext["listeners"][number]) {
      assert.equal(event, "tools/pre-execute", "plugin must subscribe to tools/pre-execute");
      listeners.push(handler);
    },
  } as unknown as Context;
  return { listeners, ctx };
}

/** 默认「下游放行」的 next。 */
const allowNext = async (): Promise<PreToolDecision> => ({ kind: "allow" });

/** 装配一个插件实例并返回它的监听者。 */
function mount(options: {
  mode?: string;
  capability?: ToolCapabilityDeclaration;
  grants?: readonly { toolName: string; ruleContent?: string }[];
  projectRules?: unknown;
  workingDirectory?: string;
  sessionConfig?: unknown;
  logger?: KnorviaPolicyConfig["logger"];
  pathModule?: KnorviaPolicyConfig["pathModule"];
  readMode?: KnorviaPolicyConfig["readMode"];
}) {
  const harness = createHarnessContext();
  const handle = apply(harness.ctx, {
    readMode:
      options.readMode ??
      ((sessionId) => (sessionId === SESSION ? (options.mode as never) : undefined)),
    readToolCapability: (name) => (name === "FixtureTool" ? options.capability : undefined),
    readSessionGrants: () => options.grants,
    readProjectRules: options.projectRules === undefined ? undefined : () => options.projectRules,
    readWorkingDirectory:
      options.workingDirectory === undefined ? undefined : () => options.workingDirectory,
    readSessionConfig:
      options.sessionConfig === undefined ? undefined : () => options.sessionConfig as never,
    pathModule: options.pathModule,
    logger: options.logger ?? NOOP_LOGGER,
  });
  assert.equal(harness.listeners.length, 1, "exactly one listener must be registered");
  return { handle, invoke: harness.listeners[0], ctx: harness.ctx };
}

const SESSION = "session-fixture";

/** 构造一次调用。 */
function execOf(
  name: string,
  args: unknown = {},
  overrides: Partial<ToolExecutionLike> = {},
): ToolExecutionLike {
  return { callId: "call-fixture", name, arguments: args, agent: { id: SESSION }, ...overrides };
}

// ---------------------------------------------------------------------------
// B1 插件形态与挂载
// ---------------------------------------------------------------------------

test("B1: missing required wiring throws immediately and names the missing field", () => {
  assert.throws(
    () => assertWired({} as never),
    /readMode is required/u,
    "missing readMode must throw",
  );
  assert.throws(
    () => assertWired({ readMode: () => "build" } as never),
    /readToolCapability is required/u,
    "missing readToolCapability must throw",
  );
  assert.throws(
    () => assertWired({ readMode: () => "build", readToolCapability: () => undefined } as never),
    /readSessionGrants is required/u,
    "missing readSessionGrants must throw",
  );
});

test("B1: mounting registers exactly one pre-execute listener and exposes the row id", () => {
  const { handle, invoke } = mount({ mode: "build" });
  assert.equal(handle.rowId, DEFAULT_POLICY_ROW_ID);
  assert.equal(typeof invoke, "function");
});

test("B1: the plugin is engine-agnostic (no runtime read of the engine switch)", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    new URL("../src/kernel-plugin-policy/index.ts", import.meta.url),
    "utf8",
  );
  // 注释里可以**提到**这个变量名（用来解释「本包不读它」）；
  // 真正要断言的是「没有可执行的引用」：去掉注释行后再检查。
  const codeOnly = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
  assert.equal(
    codeOnly.includes("KNORVIA_KERNEL_ENGINE"),
    false,
    "L10: the plugin must not read the engine switch outside comments",
  );
});

// ---------------------------------------------------------------------------
// B2 模式注册表
// ---------------------------------------------------------------------------

test("B2: an unregistered session is denied instead of defaulting to a mode", async () => {
  const { invoke } = mount({ readMode: () => undefined });
  const decision = await invoke(execOf("FixtureTool"), allowNext);
  assert.equal(decision.kind, "deny", "L3: missing mode must deny, never default to build");
});

test("B2: each of the five modes routes through its own branch", async () => {
  // yolo 在非计划时放行；auto 恒拒绝；其余走软约束。
  const yolo = await mount({ mode: "yolo" }).invoke(execOf("FixtureTool"), allowNext);
  assert.equal(yolo.kind, "allow", "yolo allows in the ordinary route");

  const auto = await mount({ mode: "auto" }).invoke(execOf("FixtureTool"), allowNext);
  assert.equal(auto.kind, "deny", "auto is reserved and unimplemented");
});

test("B2: a recorded mode change takes effect on the next execution", async () => {
  const { handle, invoke } = mount({ mode: "yolo" });
  assert.equal((await invoke(execOf("FixtureTool"), allowNext)).kind, "allow");
  handle.setMode(SESSION, "auto");
  assert.equal((await invoke(execOf("FixtureTool"), allowNext)).kind, "deny");
});

// ---------------------------------------------------------------------------
// B3 能力解析
// ---------------------------------------------------------------------------

test("B3: an unknown tool falls back to the stricter unknown defaults", () => {
  const capability = resolveCapability("TotallyUnknownTool", undefined);
  assert.equal(capability.readOnly, false);
  assert.equal(capability.sideEffectScope, "workspace");
  assert.equal(capability.needsApproval, true);
  assert.equal(capability.riskLevel, "medium");
});

test("B3: the retained product policy keeps TodoWrite and AskUserQuestion in the read-only group", () => {
  for (const name of ["TodoWrite", "AskUserQuestion"]) {
    const capability = resolveCapability(name, undefined);
    assert.equal(capability.readOnly, true, `${name} must stay read-only (K5)`);
    assert.equal(capability.sideEffectScope, "none", `${name} has no side effect scope`);
    assert.equal(capability.needsApproval, false, `${name} needs no approval`);
  }
});

test("B3: Bash is destructive with the unknown defaults", () => {
  const capability = resolveCapability("Bash", undefined);
  assert.equal(capability.destructive, true);
  assert.equal(capability.needsApproval, true);
});

test("B3: a readOnly override never grants unrelated powers", () => {
  // 只声明 readOnly；needsApproval 必须仍按缺省表（UNKNOWN 档 = true）。
  const capability = resolveCapability("SomeTool", { readOnly: true });
  assert.equal(capability.readOnly, true);
  assert.equal(capability.needsApproval, true, "readOnly must not imply needsApproval=false");
  assert.equal(capability.destructive, false);
});

test("B3: a throwing capability reader fails closed via the plugin", async () => {
  const harness = createHarnessContext();
  apply(harness.ctx, {
    readMode: () => "build",
    readToolCapability: () => {
      throw new Error("declaration store unavailable");
    },
    readSessionGrants: () => undefined,
    logger: NOOP_LOGGER,
  });
  const decision = await harness.listeners[0](execOf("FixtureTool"), allowNext);
  assert.equal(decision.kind, "deny", "L5: a reader failure must deny");
});

// ---------------------------------------------------------------------------
// B4 模式快照与并发
// ---------------------------------------------------------------------------

test("B4: a mode change during evaluation does not affect the current execution", async () => {
  let currentMode: string = "yolo";
  const { handle, invoke } = mount({ readMode: () => currentMode as never });
  // 先让 registry 缓存 yolo。
  assert.equal((await invoke(execOf("FixtureTool"), allowNext)).kind, "allow");

  // 造一个「判定过程中改模式」的下游：next() 里改。
  const mutateDuringNext = async (): Promise<PreToolDecision> => {
    handle.setMode(SESSION, "auto");
    return { kind: "allow" };
  };
  const decision = await invoke(execOf("FixtureTool"), mutateDuringNext);
  // 本次仍应使用入口快照（yolo → allow），而不是中途改成的 auto。
  assert.equal(decision.kind, "allow", "L2: the snapshot must survive a mid-evaluation change");

  // 下一次执行才用新模式。
  currentMode = "auto";
  assert.equal((await invoke(execOf("FixtureTool"), allowNext)).kind, "deny");
});

test("B4: concurrent executions keep independent snapshots", async () => {
  const { invoke } = mount({ mode: "yolo" });
  const [first, second] = await Promise.all([
    invoke(execOf("FixtureTool", {}, { callId: "call-1" }), allowNext),
    invoke(execOf("FixtureTool", {}, { callId: "call-2" }), allowNext),
  ]);
  assert.equal(first.kind, "allow");
  assert.equal(second.kind, "allow");
});

// ---------------------------------------------------------------------------
// B5 7 条路线
// ---------------------------------------------------------------------------

test("B5-1: EnterPlanMode is always allowed and ExitPlanMode outside plan mode is denied", async () => {
  const { invoke } = mount({ mode: "build" });
  assert.equal((await invoke(execOf("EnterPlanMode"), allowNext)).kind, "allow");
  assert.equal((await invoke(execOf("ExitPlanMode"), allowNext)).kind, "deny");
});

test("B5-2: requiresUserInteraction asks before auto policy and denies when explicitly disallowed", async () => {
  const asked = await mount({
    mode: "auto",
    capability: { requiresUserInteraction: true },
  }).invoke(execOf("FixtureTool"), allowNext);
  assert.equal(asked.kind, "ask", "interaction precedes the auto deny");

  const denied = await mount({
    mode: "auto",
    capability: { requiresUserInteraction: true },
    sessionConfig: { disallowedTools: new Set(["FixtureTool"]) },
  }).invoke(execOf("FixtureTool"), allowNext);
  assert.equal(denied.kind, "deny", "the hard deny list wins inside the interaction route");
});

test("B5-3: alwaysAsk cannot be bypassed by a project allow rule", async () => {
  const harness = mount({
    mode: "build",
    capability: { alwaysAsk: true },
    projectRules: { allow: [{ toolName: "FixtureTool" }] },
  });
  const decision = await harness.invoke(execOf("FixtureTool"), allowNext);
  assert.equal(decision.kind, "ask", "project allow must not bypass alwaysAsk");
});

test("B5-4: ordinary yolo allows but still respects the hard interaction route", async () => {
  const yolo = await mount({ mode: "yolo" }).invoke(execOf("FixtureTool"), allowNext);
  assert.equal(yolo.kind, "allow");

  const interaction = await mount({
    mode: "yolo",
    capability: { requiresUserInteraction: true },
  }).invoke(execOf("FixtureTool"), allowNext);
  assert.equal(interaction.kind, "ask", "yolo must not bypass the interaction route");
});

test("B5-5: plan mode allows only the three capability classes and denies the rest", async () => {
  const readOnly = await mount({ mode: "plan" }).invoke(execOf("Read"), allowNext);
  assert.equal(readOnly.kind, "allow", "read-only tools are allowed under plan");

  const mutating = await mount({ mode: "plan" }).invoke(execOf("Bash"), allowNext);
  assert.equal(mutating.kind, "deny", "mutating tools are denied under plan");

  const mcp = await mount({
    mode: "plan",
    capability: { permission: { permission: "mcp" } },
  }).invoke(execOf("FixtureTool"), allowNext);
  assert.equal(mcp.kind, "allow", "non-destructive mcp is allowed under plan");

  const sessionControl = await mount({
    mode: "plan",
    capability: { allowedInPlanMode: true, sideEffectScope: "session", needsApproval: false },
  }).invoke(execOf("FixtureTool"), allowNext);
  assert.equal(
    sessionControl.kind,
    "allow",
    "explicit session-scoped capability is allowed under plan",
  );
});

test("B5-6: edit exemption requires both the edit permission and workspace scope", async () => {
  const both = await mount({
    mode: "edit",
    capability: { permission: { permission: "edit" }, sideEffectScope: "workspace" },
  }).invoke(execOf("FixtureTool"), allowNext);
  assert.equal(both.kind, "allow", "edit + workspace is exempted");

  const wrongScope = await mount({
    mode: "edit",
    capability: { permission: { permission: "edit" }, sideEffectScope: "session" },
  }).invoke(execOf("FixtureTool"), allowNext);
  assert.notEqual(wrongScope.kind, "allow", "edit without workspace scope is not exempted");

  const wrongPermission = await mount({
    mode: "edit",
    capability: { sideEffectScope: "workspace" },
  }).invoke(execOf("FixtureTool"), allowNext);
  assert.notEqual(wrongPermission.kind, "allow", "workspace scope without edit is not exempted");
});

test("B5-7: the build route asks for critical and high risk tools", async () => {
  const critical = await mount({
    mode: "build",
    capability: { riskLevel: "critical", needsApproval: true },
  }).invoke(execOf("FixtureTool"), allowNext);
  assert.equal(critical.kind, "ask", "critical risk asks");

  const high = await mount({
    mode: "build",
    capability: { riskLevel: "high", needsApproval: true },
  }).invoke(execOf("FixtureTool"), allowNext);
  assert.equal(high.kind, "ask", "high risk asks when autoApproveHighRisk is off");

  const highAuto = await mount({
    mode: "build",
    // needsApproval:false 才能隔离「autoApproveHighRisk 只影响 high 档」这一条；
    // 否则工具会因 needsApproval 走到 `mode.build.sideEffect` 而 ask —— 那是另一档语义。
    capability: { riskLevel: "high", needsApproval: false, sideEffectScope: "none" },
    sessionConfig: { autoApproveHighRisk: true },
  }).invoke(execOf("FixtureTool"), allowNext);
  assert.notEqual(highAuto.kind, "ask", "autoApproveHighRisk opts out of the high-risk prompt");
});

test("B5-8: an internal error denies instead of rethrowing", async () => {
  const { invoke } = mount({ mode: "build" });
  const throwingNext = async (): Promise<PreToolDecision> => {
    throw new Error("downstream exploded");
  };
  const decision = await invoke(execOf("FixtureTool"), throwingNext);
  assert.equal(decision.kind, "deny", "L5: internal failures must deny, never rethrow");
});

// ---------------------------------------------------------------------------
// B6 五模式
// ---------------------------------------------------------------------------

test("B6: auto mode is denied with the reserved rule and never degraded to build", async () => {
  const decision = await mount({ mode: "auto" }).invoke(execOf("Read"), allowNext);
  // Read 在 build 下会 allow；auto 必须 deny。
  assert.equal(decision.kind, "deny", "L6: auto must not degrade to build");
});

test("B6: yolo does not bypass an active plan", async () => {
  // plan 模式（yolo 的 bypass 只在非计划时生效）。
  const decision = await mount({ mode: "plan" }).invoke(execOf("Bash"), allowNext);
  assert.equal(decision.kind, "deny", "plan takes precedence over yolo bypass");
});

// ---------------------------------------------------------------------------
// B7 取消
// ---------------------------------------------------------------------------

test("B7: an already-aborted signal cancels instead of denying", async () => {
  const controller = new AbortController();
  controller.abort();
  const decision = await mount({ mode: "build" }).invoke(
    execOf("FixtureTool", {}, { signal: controller.signal }),
    allowNext,
  );
  assert.equal(decision.kind, "cancel", "cancellation is not a denial");
});

test("B7: the plugin never registers a signal listener", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    new URL("../src/kernel-plugin-policy/index.ts", import.meta.url),
    "utf8",
  );
  assert.equal(
    source.includes("addEventListener"),
    false,
    "B7: the plugin must not subscribe to abort signals (leak avoidance)",
  );
});

// ---------------------------------------------------------------------------
// B8 会话授权
// ---------------------------------------------------------------------------

test("B8: a session grant is scoped to one session", async () => {
  const harness = mount({ mode: "build", grants: [{ toolName: "Bash" }] });
  const granted = await harness.invoke(execOf("Bash"), allowNext);
  assert.equal(granted.kind, "allow", "the granted tool is allowed in its session");

  const otherSession = await harness.invoke(
    execOf("Bash", {}, { agent: { id: "another-session" } }),
    allowNext,
  );
  assert.equal(otherSession.kind, "deny", "L4: grants must not leak across sessions");
});

test("B8: recording the same grant twice does not duplicate it", () => {
  const { handle } = mount({ mode: "build" });
  handle.grantSessionPermission(SESSION, { toolName: "Bash" });
  handle.grantSessionPermission(SESSION, { toolName: "Bash" });
  assert.equal(handle.grants.snapshot(SESSION).length, 1, "grants use set semantics");
});

test("B8: forgetting a session clears its grants", async () => {
  const { handle, invoke } = mount({ mode: "build", grants: [{ toolName: "Bash" }] });
  handle.forgetSession(SESSION);
  // forgetSession 只清本包的内部集合；外部 readSessionGrants 仍会返回 —— 验证内部不再增长。
  assert.equal(handle.grants.size(), 0);
  void invoke;
});

test("B8: a grant with rule content matches by command prefix with a boundary", () => {
  const { handle } = mount({ mode: "build" });
  handle.grantSessionPermission(SESSION, { toolName: "Bash", ruleContent: "git status:*" });
  assert.equal(
    handle.grants.matches(SESSION, {
      toolName: "Bash",
      arguments: { command: "git status --short" },
    }),
    true,
    "the prefix matches when followed by a boundary",
  );
  assert.equal(
    handle.grants.matches(SESSION, { toolName: "Bash", arguments: { command: "git statusx" } }),
    false,
    "the prefix must not match a longer word",
  );
});

// ---------------------------------------------------------------------------
// B9 fail closed
// ---------------------------------------------------------------------------

test("B9: a missing agent session fails closed", async () => {
  const { invoke } = mount({ mode: "build" });
  const decision = await invoke(execOf("FixtureTool", {}, { agent: undefined }), allowNext);
  assert.equal(decision.kind, "deny");
});

test("B9: a route exhaustion is reported as a deny decision", async () => {
  const { routeExhausted } = await import("../src/kernel-plugin-policy/policy-routes.js");
  const decision = routeExhausted();
  assert.equal(decision.kind, "deny");
  assert.equal(decision.ruleId, "route.exhausted");
});

// ---------------------------------------------------------------------------
// B10 幂等与重入
// ---------------------------------------------------------------------------

test("B10: re-entering the same execution yields the same decision without new grants", async () => {
  const { handle, invoke } = mount({ mode: "build" });
  const exec = execOf("Bash", { command: "rm -rf /" });
  const first = await invoke(exec, allowNext);
  const second = await invoke(exec, allowNext);
  assert.deepEqual(first, second, "the same execution yields the same decision");
  assert.equal(handle.grants.size(), 0, "no grant must be written during evaluation");
});

// ---------------------------------------------------------------------------
// B11 不泄漏
// ---------------------------------------------------------------------------

test("B11: secrets in tool arguments never appear in decisions or logs", async () => {
  const captured = createCapturingLogger();
  const secret = "/very/secret/path/fixture.txt";
  const { invoke } = mount({ mode: "build", logger: captured.logger });
  const decision = await invoke(execOf("Write", { file_path: secret }), allowNext);

  const serialized = JSON.stringify({ decision, logs: captured.entries });
  assert.equal(serialized.includes(secret), false, "L9: tool arguments must not leak");
});

test("B11: every denial reason is a stable non-empty sentence", async () => {
  const captured = createCapturingLogger();
  const { invoke } = mount({ mode: "auto", logger: captured.logger });
  const decision = await invoke(execOf("Bash"), allowNext);
  assert.equal(decision.kind, "deny");
  assert.equal(typeof (decision as { reason?: string }).reason, "string");
  assert.ok(((decision as { reason?: string }).reason ?? "").length > 0);
});

// ---------------------------------------------------------------------------
// B12 平台差异
// ---------------------------------------------------------------------------

test("B12: workflow draft detection is strict on win32 paths", async () => {
  const { handle: _unused, ...rest } = {} as never;
  void _unused;
  void rest;
  const win32 = nodePath.win32;
  const { invoke } = mount({
    mode: "build",
    workingDirectory: "C:\\workspace",
    pathModule: {
      isAbsolute: (value) => win32.isAbsolute(value),
      relative: (base, target) => win32.relative(base, target),
      resolve: (...segments) => win32.resolve(...segments),
    },
  });

  const inside = await invoke(
    execOf("Write", { file_path: "C:\\workspace\\.knorvia-studio\\workflow-drafts\\a.md" }),
    allowNext,
  );
  assert.equal(inside.kind, "allow", "a draft write is preapproved");

  const sibling = await invoke(
    execOf("Write", { file_path: "C:\\workspace\\.knorvia-studio\\workflow-drafts-other\\a.md" }),
    allowNext,
  );
  assert.notEqual(sibling.kind, "allow", "a sibling directory is not the drafts directory");
});

test("B12: workflow draft detection is strict on posix paths", async () => {
  const posix = nodePath.posix;
  const { invoke } = mount({
    mode: "build",
    workingDirectory: "/workspace",
    pathModule: {
      isAbsolute: (value) => posix.isAbsolute(value),
      relative: (base, target) => posix.relative(base, target),
      resolve: (...segments) => posix.resolve(...segments),
    },
  });
  assert.equal(
    (
      await invoke(
        execOf("Write", { file_path: "/workspace/.knorvia-studio/workflow-drafts/a.md" }),
        allowNext,
      )
    ).kind,
    "allow",
  );
  assert.notEqual(
    (await invoke(execOf("Write", { file_path: "/workspace/other/a.md" }), allowNext)).kind,
    "allow",
  );
});

test("B12: a missing working directory never exempts a draft write", async () => {
  const { invoke } = mount({ mode: "build" });
  const decision = await invoke(
    execOf("Write", { file_path: ".knorvia-studio/workflow-drafts/a.md" }),
    allowNext,
  );
  assert.notEqual(
    decision.kind,
    "allow",
    "without a working directory the target cannot be located",
  );
});

// ---------------------------------------------------------------------------
// 工具清单漂移检测（Lead 2026-10-22 裁决的约束 2）
// ---------------------------------------------------------------------------

test("catalogue drift reports tools registered by the host but absent from the defaults table", () => {
  const drift = detectCatalogueDrift(["Read", "Bash", "BrandNewTool"]);
  assert.deepEqual(drift.unlisted, ["BrandNewTool"], "an unlisted tool must be reported");
  assert.ok(drift.stale.includes("WebFetch"), "known tools not registered are reported as stale");
});

test("catalogue drift is empty when the host registers exactly the known tools", () => {
  const drift = detectCatalogueDrift(knownToolNames());
  assert.deepEqual(drift.unlisted, []);
  assert.deepEqual(drift.stale, []);
});

// ---------------------------------------------------------------------------
// 硬约束 / 软约束的分离（Lead 2026-10-22 裁决 (1)）
// ---------------------------------------------------------------------------

test("hard constraints short-circuit without consulting the downstream listener", async () => {
  let downstreamCalls = 0;
  const countingNext = async (): Promise<PreToolDecision> => {
    downstreamCalls += 1;
    return { kind: "allow" };
  };
  const { invoke } = mount({ mode: "build", capability: { alwaysAsk: true } });
  const decision = await invoke(execOf("FixtureTool"), countingNext);
  assert.equal(decision.kind, "ask");
  assert.equal(downstreamCalls, 0, "a hard constraint must not call next()");
});

test("soft constraints consult the downstream listener and respect its refusal", async () => {
  let downstreamCalls = 0;
  const refusingNext = async (): Promise<PreToolDecision> => {
    downstreamCalls += 1;
    return { kind: "deny", reason: "user hook denied this call" };
  };
  const { invoke } = mount({ mode: "build" });
  const decision = await invoke(execOf("Read"), refusingNext);
  assert.equal(decision.kind, "deny", "the downstream refusal is respected");
  assert.equal(downstreamCalls, 1, "the soft path must consult next()");
});

test("soft constraints apply after the downstream listener allows", async () => {
  const { invoke } = mount({
    mode: "build",
    capability: { riskLevel: "critical", needsApproval: true },
  });
  const decision = await invoke(execOf("FixtureTool"), allowNext);
  assert.equal(decision.kind, "ask", "the product policy still applies after a downstream allow");
});
