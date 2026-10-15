// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-workflow-01 contract tests: CreateWorkflow input resolution, handler paths and
// the confirmation gate. Port calls are recorded as an event sequence — no sleeps, no timers.
// Expected strings are recorded old-implementation copy (behavior.md B-cw-*).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  DIAGNOSTICS_NOT_EXECUTED_NOTE,
  EXECUTION_UNAVAILABLE_NOTE,
  createWorkflowToolEntry,
  describeWorkflowConcurrencyLimit,
  resolveTraceContext,
} from "../../../../apps/cli/packages/core/src/tool/handlers/create-workflow.js";
import {
  SUBAGENT_MODEL_UNAVAILABLE,
  clampWorkflowMaxConcurrency,
  resolveCreateWorkflowInput,
  validateCreateWorkflowSource,
} from "../../../../apps/cli/packages/core/src/tool/handlers/create-workflow-source.js";

const SOURCE_ERROR =
  "Provide exactly one workflow source: `script` for a one-off script written inline, `saved` to run a workflow saved in this project, or `path` for a script file on disk (the file a previous result named). Passing more than one, or none, is ambiguous.";
const ARGS_WITHOUT_PATH_ERROR =
  "`args` belongs to the `path` source: it carries values for the arguments a script file declares in its `/* knorvia-workflow` block. For a saved workflow pass `saved.args`; an inline `script` declares no arguments, so it takes none.";

const CLEAN_SCRIPT = 'phase("Research each changed file in parallel")\nreturn 1;\n';
const BAD_SCRIPT = 'const x: number = "nope";\nreturn x;\n';

/** 录制型模型目录：命中即回旧实现实测的规范形。 */
function catalog() {
  return {
    listModels: () => [
      {
        providerId: "prov",
        modelId: "mod",
        reasoningLevels: ["high"],
        defaultReasoningLevel: "high",
        current: false,
      },
    ],
  };
}

function scratch(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `wf01-cw-${prefix}-`));
}

test("B-cw-1 来源三选一是模型入参级校验，违规回固定文案", () => {
  assert.deepEqual(validateCreateWorkflowSource({}), {
    result: false,
    errorCode: 400,
    message: SOURCE_ERROR,
  });
  assert.deepEqual(validateCreateWorkflowSource({ script: "x", path: "y" }), {
    result: false,
    errorCode: 400,
    message: SOURCE_ERROR,
  });
  assert.deepEqual(validateCreateWorkflowSource({ script: "x", saved: { name: "n" } }), {
    result: false,
    errorCode: 400,
    message: SOURCE_ERROR,
  });
  assert.deepEqual(validateCreateWorkflowSource({ script: CLEAN_SCRIPT }), { result: true });
});

test("B-cw-2 args 只跟 path 走；schema 之外的形状照常放行", () => {
  assert.deepEqual(validateCreateWorkflowSource({ script: "x", args: { a: 1 } }), {
    result: false,
    errorCode: 400,
    message: ARGS_WITHOUT_PATH_ERROR,
  });
  assert.deepEqual(validateCreateWorkflowSource({ path: "p.dwf.ts", args: { a: 1 } }), {
    result: true,
  });
  // schema 本身的失败由 executor 更早收口：这里不重复判，XOR 只在合法入参上成立。
  assert.deepEqual(validateCreateWorkflowSource("not an object"), { result: true });
  assert.deepEqual(validateCreateWorkflowSource({ saved: { name: "n", args: { a: 1 } } }), {
    result: true,
  });
});

test("B-cw-3 并发上界钳到 [1, 天花板]，超界压低而不是拒绝", () => {
  assert.equal(clampWorkflowMaxConcurrency(3, 8), 3);
  assert.equal(clampWorkflowMaxConcurrency(32, 8), 8);
  assert.equal(clampWorkflowMaxConcurrency(32, undefined), 32);
  assert.equal(clampWorkflowMaxConcurrency(0, 5), 1);
  assert.equal(clampWorkflowMaxConcurrency(-3, undefined), 1);
  // 天花板自身异常时仍给出可执行的下界。
  assert.equal(clampWorkflowMaxConcurrency(5, 0), 1);
});

test("B-cw-4 内联来源无事可做时逐字节恒等放行", async () => {
  const cwd = scratch("identity");
  try {
    const input = { script: CLEAN_SCRIPT };
    const resolved = await resolveCreateWorkflowInput(input, cwd, undefined, undefined);
    assert.deepEqual(resolved, { result: true, input });
    assert.equal((resolved as { input: unknown }).input, input, "恒等：同一个对象");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-cw-5 内联来源只改写钳过的并发与归一后的模型名", async () => {
  const cwd = scratch("inline");
  try {
    const resolved = await resolveCreateWorkflowInput(
      { script: CLEAN_SCRIPT, max_concurrency: 32, subagent_model: "prov/mod" },
      cwd,
      8,
      catalog(),
    );
    assert.deepEqual(resolved, {
      result: true,
      input: {
        script: CLEAN_SCRIPT,
        max_concurrency: 8,
        subagent_model: "prov/mod$high",
      },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-cw-6 子代理模型：目录缺席明确拒绝，解不出来整次失败", async () => {
  const cwd = scratch("model");
  try {
    const noCatalog = await resolveCreateWorkflowInput(
      { script: CLEAN_SCRIPT, subagent_model: "prov/mod" },
      cwd,
      undefined,
      undefined,
    );
    assert.deepEqual(noCatalog, {
      result: false,
      errorCode: 400,
      message: SUBAGENT_MODEL_UNAVAILABLE,
    });

    const unknown = await resolveCreateWorkflowInput(
      { script: CLEAN_SCRIPT, subagent_model: "prov/nope" },
      cwd,
      undefined,
      catalog(),
    );
    assert.equal((unknown as { result: boolean }).result, false);
    assert.match(
      (unknown as { message: string }).message,
      /No configured model matches `prov\/nope`/u,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-cw-7 path 来源：剥块、验实参、记偏移，且不写草稿", async () => {
  const cwd = scratch("pathsrc");
  try {
    const file = path.join(cwd, "flow.dwf.ts");
    writeFileSync(
      file,
      "/* knorvia-workflow\ndescription: d\nargs:\n  pr:\n    type: string\n    required: true\n  depth:\n    type: number\n    default: 3\n*/\nreturn 1;\n",
      "utf8",
    );
    const resolved = await resolveCreateWorkflowInput(
      { path: "flow.dwf.ts", args: { pr: "123" }, max_concurrency: 2 },
      cwd,
      undefined,
      undefined,
    );
    assert.deepEqual(resolved, {
      result: true,
      input: {
        script: "return 1;\n",
        path: file,
        args: { pr: "123", depth: 3 },
        script_line_offset: 10,
        max_concurrency: 2,
      },
    });
    // path 来源不写草稿：文件已经是工作副本。
    assert.equal(existsSync(path.join(cwd, ".knorvia-studio", "workflow-drafts")), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-cw-8 path 来源实参边界：无块拒实参，错实参给声明复述", async () => {
  const cwd = scratch("pathargs");
  try {
    writeFileSync(path.join(cwd, "plain.dwf.ts"), "return 1;\n", "utf8");
    const noBlock = await resolveCreateWorkflowInput(
      { path: "plain.dwf.ts", args: { a: 1 } },
      cwd,
      undefined,
      undefined,
    );
    assert.equal((noBlock as { result: boolean }).result, false);
    assert.match(
      (noBlock as { message: string }).message,
      /declares no arguments \(it has no `\/\* knorvia-workflow` metadata block\), so it takes none/u,
    );

    writeFileSync(
      path.join(cwd, "decl.dwf.ts"),
      "/* knorvia-workflow\ndescription: d\nargs:\n  pr:\n    type: string\n    required: true\n*/\nreturn 1;\n",
      "utf8",
    );
    const wrong = await resolveCreateWorkflowInput(
      { path: "decl.dwf.ts", args: { nope: 1 } },
      cwd,
      undefined,
      undefined,
    );
    assert.equal((wrong as { result: boolean }).result, false);
    const message = (wrong as { message: string }).message;
    assert.match(message, /are not valid:/u);
    assert.match(message, /unknown argument 'nope'/u);
    assert.match(message, /missing required argument 'pr'/u);
    assert.match(message, /declares:/u);
    assert.match(message, /- pr \(string, required\)/u);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-cw-9 saved 来源：读定义、验实参、写全文件草稿、回填来龙去脉", async () => {
  const cwd = scratch("saved");
  try {
    const archive = path.join(cwd, ".knorvia-studio", "workflows");
    mkdirSync(archive, { recursive: true });
    const savedFile = path.join(archive, "pr-review.dwf.ts");
    writeFileSync(
      savedFile,
      "/* knorvia-workflow\ndescription: d\nargs:\n  pr:\n    type: string\n    required: true\n  depth:\n    type: number\n    default: 3\n*/\nreturn 1;\n",
      "utf8",
    );

    const resolved = await resolveCreateWorkflowInput(
      { saved: { name: "pr-review", args: { pr: "123" } } },
      cwd,
      undefined,
      undefined,
    );
    const input = (resolved as { input: Record<string, unknown> }).input;
    assert.equal(input.script, "return 1;\n");
    assert.equal(input.name, "pr-review", "未给展示名时沿用保存名");
    assert.equal(input.script_line_offset, 10);
    assert.equal(input.args, undefined, "saved 来源的实参住在 saved.args，不在顶层");
    const saved = input.saved as Record<string, unknown>;
    assert.equal(saved.name, "pr-review");
    assert.equal(saved.path, savedFile);
    assert.equal(saved.scope, "project");
    assert.deepEqual(saved.args, { pr: "123", depth: 3 }, "默认值补齐");
    // 工作副本 = 刚读到的字节（元数据块一起），且每个顶层字段都被点名保留。
    assert.equal(typeof saved.draft, "string");
    assert.equal(readFileSync(saved.draft as string, "utf8"), readFileSync(savedFile, "utf8"));
    assert.deepEqual(input.max_concurrency, undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-cw-10 saved 解析失败列可用名，找不到按作用域分档", async () => {
  const cwd = scratch("savedfail");
  try {
    const empty = await resolveCreateWorkflowInput(
      { saved: { name: "ghost" } },
      cwd,
      undefined,
      undefined,
    );
    assert.equal((empty as { result: boolean }).result, false);
    assert.match(
      (empty as { message: string }).message,
      /No saved workflow named 'ghost' in this project or globally\./u,
    );
    assert.match(
      (empty as { message: string }).message,
      /There are no saved workflows yet, in this project or globally\. Use SaveWorkflow to create one, or pass an inline `script` instead\./u,
    );

    const archive = path.join(cwd, ".knorvia-studio", "workflows");
    mkdirSync(archive, { recursive: true });
    writeFileSync(
      path.join(archive, "pr-review.dwf.ts"),
      "/* knorvia-workflow\ndescription: d\n*/\nreturn 1;\n",
      "utf8",
    );
    const scoped = await resolveCreateWorkflowInput(
      { saved: { name: "ghost", scope: "global" } },
      cwd,
      undefined,
      undefined,
    );
    assert.equal((scoped as { result: boolean }).result, false);
    assert.match((scoped as { message: string }).message, /No global workflow named 'ghost'\./u);
    assert.match(
      (scoped as { message: string }).message,
      /Available saved workflows: pr-review \(project\)/u,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-cw-11 编译失败：回诊断与点名文件的 NOTE，草稿照写不误", async () => {
  const cwd = scratch("diag");
  try {
    const events: string[] = [];
    const output = await createWorkflowToolEntry.handler({ script: BAD_SCRIPT }, {
      workingDirectory: cwd,
      toolCallId: "call-diag",
      sessionId: "session-diag",
      dynamicWorkflowRunPort: {
        submit: async () => {
          events.push("submit");
          return { runId: "never" };
        },
      },
    } as never);
    assert.equal(events.length, 0, "编译失败不提交、不建 run");
    assert.equal(output.ok, false);
    assert.equal(output.diagnostics.length, 1);
    assert.deepEqual(output.diagnostics[0], {
      code: 2322,
      column: 7,
      line: 1,
      message: "Type 'string' is not assignable to type 'number'.",
    });
    assert.equal(output.causalityGraph, undefined);

    const described = path.join(".knorvia-studio", "workflow-drafts", "workflow.dwf.ts");
    assert.equal(
      output.response,
      [
        "The workflow script has errors:",
        `${described}:L1:C7 Type 'string' is not assignable to type 'number'.`,
        "",
        `NOTE: The workflow was NOT executed. The script is saved at ${described}. Edit that file in place and resubmit with \`path: "${described}"\` — do not paste the script inline again.`,
      ].join("\n"),
    );
    assert.equal(
      readFileSync(path.join(cwd, ".knorvia-studio", "workflow-drafts", "workflow.dwf.ts"), "utf8"),
      BAD_SCRIPT,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-cw-12 端口缺席：干净脚本只 typecheck，占位文案明说没执行", async () => {
  const cwd = scratch("noport");
  try {
    const output = await createWorkflowToolEntry.handler({ script: CLEAN_SCRIPT }, {
      workingDirectory: cwd,
      toolCallId: "call-x",
      sessionId: "session-x",
    } as never);
    assert.equal(output.ok, true);
    assert.deepEqual(output.diagnostics, []);
    assert.equal(output.status, undefined);
    assert.equal(
      output.response,
      `The workflow script compiled cleanly.\n\n${EXECUTION_UNAVAILABLE_NOTE}`,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-cw-13 端口在场：一次 submit，载荷逐字段，输出 backgrounded", async () => {
  const cwd = scratch("submit");
  try {
    const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
    const port = {
      concurrencyCeiling: () => 8,
      submit: async (payload: Record<string, unknown>) => {
        events.push({ name: "submit", payload });
        return { runId: "run-7" };
      },
    };
    const resolved = await resolveCreateWorkflowInput(
      { script: CLEAN_SCRIPT, name: "PR review", max_concurrency: 3, subagent_model: "prov/mod" },
      cwd,
      8,
      catalog(),
    );
    const input = (resolved as { input: unknown }).input;
    const output = await createWorkflowToolEntry.handler(input, {
      workingDirectory: cwd,
      toolCallId: "call-7",
      sessionId: "session-7",
      traceId: "trace-7",
      turnId: "turn-7",
      dynamicWorkflowRunPort: port,
    } as never);

    assert.equal(events.length, 1, "恰好一次提交");
    const payload = events[0]!.payload;
    assert.equal(payload.scriptText, CLEAN_SCRIPT);
    assert.equal(payload.cwd, cwd);
    assert.equal(payload.name, "PR review");
    assert.equal(payload.parentSessionId, "session-7");
    assert.equal(payload.toolCallId, "call-7");
    assert.deepEqual(payload.phaseNames, ["Research each changed file in parallel"]);
    assert.equal(payload.maxConcurrency, 3);
    assert.deepEqual(payload.subagentModel, {
      providerId: "prov",
      modelId: "mod",
      options: { reasoningLevel: "high" },
    });
    const draftPath = path.join(cwd, ".knorvia-studio", "workflow-drafts", "PR-review.dwf.ts");
    assert.equal(payload.scriptPath, draftPath);
    assert.deepEqual(payload.trace, {
      traceId: "trace-7",
      spanId: undefined,
      parentSpanId: undefined,
      sessionId: "session-7",
      turnId: "turn-7",
    });

    assert.equal(output.status, "backgrounded");
    assert.equal(output.backgroundTaskId, "run-7");
    const described = path.join(".knorvia-studio", "workflow-drafts", "PR-review.dwf.ts");
    assert.equal(
      output.response,
      "The workflow script compiled cleanly and the run started in the background with ID: run-7. " +
        "It is still running — you will be notified with the final output when it completes. " +
        "Do not wait for it or poll it with TaskOutput; continue with other work unless the user asked you to wait." +
        " At most 3 subagents run at once." +
        " Subagents run on prov/mod$high (the main agent stays on the session model)." +
        ` The script is saved at ${described}; to revise it later, edit that file and pass \`path\` to AmendWorkflow.`,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-cw-14 提交失败向上冒泡，不吞成带 ID 的成功", async () => {
  const cwd = scratch("submitfail");
  try {
    const port = {
      concurrencyCeiling: () => 8,
      submit: async () => {
        throw new Error("journal unavailable");
      },
    };
    await assert.rejects(
      createWorkflowToolEntry.handler({ script: CLEAN_SCRIPT }, {
        workingDirectory: cwd,
        toolCallId: "c",
        sessionId: "s",
        dynamicWorkflowRunPort: port,
      } as never),
      /journal unavailable/u,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-cw-15 确认门：干净脚本弹窗带 display，编不过直接放行", () => {
  const ask = createWorkflowToolEntry.prepareApproval!({ script: CLEAN_SCRIPT });
  assert.equal(ask.gate, "ask");
  const display = (ask as { display?: { kind?: string } }).display;
  assert.equal(display?.kind, "create_workflow");
  assert.deepEqual(createWorkflowToolEntry.prepareApproval!({ script: BAD_SCRIPT }), {
    gate: "proceed",
  });
  assert.deepEqual(createWorkflowToolEntry.prepareApproval!({ name: "x" }), { gate: "proceed" });
});

test("B-cw-16 并发文案只在设了上界时出现，压到本机上限时点破", () => {
  assert.equal(describeWorkflowConcurrencyLimit(undefined, 8), "");
  assert.equal(describeWorkflowConcurrencyLimit(1, undefined), " At most 1 subagent runs at once.");
  assert.equal(describeWorkflowConcurrencyLimit(3, 8), " At most 3 subagents run at once.");
  assert.equal(
    describeWorkflowConcurrencyLimit(8, 8),
    " At most 8 subagents run at once (this machine's maximum).",
  );
});

test("B-cw-17 trace 合成：离散字段拼出端口要的整体，整体在场原样用", () => {
  const composed = resolveTraceContext({
    traceId: "t1",
    spanId: "s1",
    parentSpanId: "p1",
    sessionId: "sess",
    turnId: "turn",
  } as never);
  assert.deepEqual(composed, {
    traceId: "t1",
    spanId: "s1",
    parentSpanId: "p1",
    sessionId: "sess",
    turnId: "turn",
  });

  const whole = { traceId: "t2", sessionId: "s2" } as never;
  assert.equal(resolveTraceContext({ traceContext: whole } as never), whole);
});

test("B-tp-1 CreateWorkflow 工具声明：昂贵、总要确认、会话内可放行", () => {
  const entry = createWorkflowToolEntry;
  assert.equal(entry.metadata.name, "CreateWorkflow");
  assert.equal(entry.metadata.readOnly, false);
  assert.equal(entry.metadata.destructive, false);
  assert.equal(entry.metadata.concurrentSafe, true);
  assert.equal(entry.metadata.timeoutMs, 15_000);
  assert.equal(entry.metadata.maxOutputBytes, 24_000);
  assert.equal(entry.metadata.needsApproval, true);
  assert.equal(entry.permission.permission, "createWorkflow");
  assert.equal(entry.permission.alwaysAsk, true);
  assert.deepEqual(entry.permission.askOptions, { allowAlways: "session" });
  assert.equal(entry.cancellation.supported, false);
  assert.match(entry.cancellation.userVisibleMessage, /cannot be cancelled/u);
  assert.equal(entry.timeout.defaultMs, 15_000);
  assert.equal(entry.timeout.allowCallOverride, false);
  assert.equal(entry.trace.required, true);
  assert.equal(entry.trace.propagateToAdapters, true);
});

test("B-tp-1 工具描述点明三选一、阶段必填、修订路由与常量文案", () => {
  const text = createWorkflowToolEntry.metadata.description;
  assert.match(text, /Create and run a dynamic workflow/u);
  assert.match(text, /Three ways to give the workflow to run — pass exactly one:/u);
  assert.match(text, /call AmendWorkflow with the run's ID and the revised script/u);
  assert.match(text, /Phases — required in every script, not optional:/u);
  assert.match(text, /When to use:/u);
  assert.ok(text.includes("```ts"));
  assert.equal(typeof DIAGNOSTICS_NOT_EXECUTED_NOTE, "string");
  assert.equal(typeof EXECUTION_UNAVAILABLE_NOTE, "string");
});
