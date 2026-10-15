// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-workflow-01 contract tests: SaveWorkflow saving semantics and EvalWorkflowSnippet
// experiment channel. Port traffic is recorded as an event sequence; no sleeps, no timers.
// Global-scope tests redirect the product data root via KNORVIA_DATA_BASE_DIR into a temp directory —
// no real user data directory is ever touched.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { saveWorkflowToolEntry } from "../../../../apps/cli/packages/core/src/tool/handlers/save-workflow.js";
import { evalWorkflowSnippetToolEntry } from "../../../../apps/cli/packages/core/src/tool/handlers/eval-workflow-snippet.js";

const SAVE_SOURCE_ERROR =
  "Provide exactly one script source: `script` for the body inline, or `script_path` for the file holding it (a draft, usually). Passing both, or neither, is ambiguous.";
const SAVE_SENTINEL_ERROR =
  "The `script` must be the workflow body only — it already starts with a `/* knorvia-workflow` metadata block. Pass the metadata through the `description` / `whenToUse` / `args` fields instead; the block is written for you.";
const EVAL_SOURCE_ERROR =
  "Provide exactly one snippet source: `code` for the snippet inline, or `path` for a file holding it. Passing both, or neither, is ambiguous.";
const UNAVAILABLE_NOTE =
  "NOTE: The snippet was NOT executed — snippet evaluation is not available in this session.";
const NOT_EXECUTED_NOTE =
  "NOTE: The snippet was NOT executed — fix the errors above and call the tool again.";
const DIAGNOSTICS_NOT_SAVED_NOTE =
  "NOTE: Nothing was saved — fix the errors above and call the tool again.";

const CLEAN_SCRIPT = 'phase("Research each changed file in parallel")\nreturn 1;\n';
const BAD_SCRIPT = 'const x: number = "nope";\nreturn x;\n';

function scratch(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `wf01-sw-${prefix}-`));
}

test("B-sw-1 名字不合法在入参校验收口，文案给出可用字符集", () => {
  const failed = saveWorkflowToolEntry.validateInput!({
    name: "bad/name",
    scope: "project",
    description: "d",
    script: CLEAN_SCRIPT,
  });
  assert.equal((failed as { result: boolean }).result, false);
  assert.equal((failed as { errorCode: number }).errorCode, 400);
  assert.equal(
    (failed as { message: string }).message,
    "'bad/name' is not a usable workflow name: names may only contain letters, digits, '.', '-' and '_', and must be 1-64 characters.",
  );
  assert.deepEqual(
    saveWorkflowToolEntry.validateInput!({
      name: "ok.name_1",
      scope: "project",
      description: "d",
      script: CLEAN_SCRIPT,
    }),
    { result: true },
  );
});

test("B-sw-2 保存正文二选一；schema 之外的形状照常放行", () => {
  assert.deepEqual(
    saveWorkflowToolEntry.validateInput!({
      name: "n",
      scope: "project",
      description: "d",
    }),
    { result: false, errorCode: 400, message: SAVE_SOURCE_ERROR },
  );
  assert.deepEqual(
    saveWorkflowToolEntry.validateInput!({
      name: "n",
      scope: "project",
      description: "d",
      script: "s",
      script_path: "p",
    }),
    { result: false, errorCode: 400, message: SAVE_SOURCE_ERROR },
  );
  assert.deepEqual(saveWorkflowToolEntry.validateInput!("nonsense"), { result: true });
});

test("B-sw-3 自带元数据块的内联正文拒绝；script_path 的块照常被丢", () => {
  const inline = saveWorkflowToolEntry.validateInput!({
    name: "n",
    scope: "project",
    description: "d",
    script: "/* knorvia-workflow\ndescription: d\n*/\nreturn 1;\n",
  });
  assert.deepEqual(inline, { result: false, errorCode: 400, message: SAVE_SENTINEL_ERROR });

  // 首行前有空白也算；script_path 来源的草稿本来就带着块，不拦。
  const blankFirst = saveWorkflowToolEntry.validateInput!({
    name: "n",
    scope: "project",
    description: "d",
    script: "\n/* knorvia-workflow\n*/\nx",
  });
  assert.deepEqual(blankFirst, { result: false, errorCode: 400, message: SAVE_SENTINEL_ERROR });
});

test("B-sw-4 script_path 读成正文（块丢弃），落点与覆盖判定一并回填", async () => {
  const cwd = scratch("scriptpath");
  try {
    const draft = path.join(cwd, "draft.dwf.ts");
    writeFileSync(draft, "/* knorvia-workflow\ndescription: old\n*/\nreturn 1;\n", "utf8");

    const resolved = await saveWorkflowToolEntry.resolveInput!(
      {
        name: "pr-review",
        scope: "project",
        description: "new description",
        script_path: "draft.dwf.ts",
      },
      { workingDirectory: cwd } as never,
    );
    const input = (resolved as { input: Record<string, unknown> }).input;
    assert.equal(input.script, "return 1;\n", "块被丢弃，元数据以本次调用的字段为准");
    assert.equal(input.path, path.join(cwd, ".knorvia-studio", "workflows", "pr-review.dwf.ts"));
    assert.equal(input.overwrite, false);
    assert.equal(input.shadowing, undefined);

    // 再解析一次：目标已存在 → overwrite true。
    mkdirSync(path.dirname(input.path as string), { recursive: true });
    writeFileSync(input.path as string, "old bytes\n", "utf8");
    const again = await saveWorkflowToolEntry.resolveInput!(
      {
        name: "pr-review",
        scope: "project",
        description: "new description",
        script_path: "draft.dwf.ts",
      },
      { workingDirectory: cwd } as never,
    );
    assert.equal((again as { input: Record<string, unknown> }).input.overwrite, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-sw-5 遮蔽事实按另一档是否有同名算出，供确认窗展示", async () => {
  const cwd = scratch("shadow");
  const previousBase = process.env.KNORVIA_DATA_BASE_DIR;
  const dataBase = scratch("data");
  try {
    process.env.KNORVIA_DATA_BASE_DIR = dataBase;
    const globalDir = path.join(dataBase, ".knorvia-studio", "workflows");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      path.join(globalDir, "shared.dwf.ts"),
      "/* knorvia-workflow\ndescription: g\n*/\nx\n",
      "utf8",
    );

    const hidesGlobal = await saveWorkflowToolEntry.resolveInput!(
      { name: "shared", scope: "project", description: "d", script: CLEAN_SCRIPT },
      { workingDirectory: cwd } as never,
    );
    assert.equal(
      (hidesGlobal as { input: Record<string, unknown> }).input.shadowing,
      "hides_global",
    );

    // 项目档也有同名：存全局档会被它遮蔽。
    const projectDir = path.join(cwd, ".knorvia-studio", "workflows");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      path.join(projectDir, "shared.dwf.ts"),
      "/* knorvia-workflow\ndescription: p\n*/\nx\n",
      "utf8",
    );

    const hiddenByProject = await saveWorkflowToolEntry.resolveInput!(
      { name: "shared", scope: "global", description: "d", script: CLEAN_SCRIPT },
      { workingDirectory: cwd } as never,
    );
    assert.equal(
      (hiddenByProject as { input: Record<string, unknown> }).input.shadowing,
      "hidden_by_project",
    );

    const noShadow = await saveWorkflowToolEntry.resolveInput!(
      { name: "unrelated", scope: "global", description: "d", script: CLEAN_SCRIPT },
      { workingDirectory: cwd } as never,
    );
    assert.equal((noShadow as { input: Record<string, unknown> }).input.shadowing, undefined);
  } finally {
    if (previousBase === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
    else process.env.KNORVIA_DATA_BASE_DIR = previousBase;
    rmSync(cwd, { recursive: true, force: true });
    rmSync(dataBase, { recursive: true, force: true });
  }
});

test("B-sw-6 编译失败：回诊断且一个字节都不落盘", async () => {
  const cwd = scratch("diag");
  try {
    const output = await saveWorkflowToolEntry.handler(
      { name: "bad", scope: "project", description: "d", script: BAD_SCRIPT },
      { workingDirectory: cwd, toolCallId: "c", sessionId: "s" } as never,
    );
    assert.equal(output.ok, false);
    assert.equal(output.name, "bad");
    assert.equal(output.scope, "project");
    assert.equal(output.overwritten, undefined, "没写成谈不上覆盖");
    assert.equal(output.diagnostics.length, 1);
    assert.equal(
      output.response,
      [
        "The workflow script has errors:",
        "L1:C7 Type 'string' is not assignable to type 'number'.",
        "",
        DIAGNOSTICS_NOT_SAVED_NOTE,
      ].join("\n"),
    );
    assert.equal(existsSync(path.join(cwd, ".knorvia-studio", "workflows")), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-sw-7 全局档保存四态文案（作用域 × 新建/覆盖）", async () => {
  const cwd = scratch("global");
  const previousBase = process.env.KNORVIA_DATA_BASE_DIR;
  const dataBase = scratch("data");
  try {
    process.env.KNORVIA_DATA_BASE_DIR = dataBase;
    const input = {
      name: "shared",
      scope: "global",
      description: "d",
      script: CLEAN_SCRIPT,
    };
    const first = await saveWorkflowToolEntry.handler(input, {
      workingDirectory: cwd,
      toolCallId: "c1",
      sessionId: "s",
    } as never);
    assert.equal(first.overwritten, false);
    assert.equal(
      first.response,
      `Saved global workflow 'shared' to ${first.path}. Run it with CreateWorkflow using \`saved: { name: "shared" }\`.`,
    );
    const second = await saveWorkflowToolEntry.handler(input, {
      workingDirectory: cwd,
      toolCallId: "c2",
      sessionId: "s",
    } as never);
    assert.equal(second.overwritten, true);
    assert.equal(
      second.response,
      `Replaced the saved global workflow 'shared' at ${second.path}. Run it with CreateWorkflow using \`saved: { name: "shared" }\`.`,
    );
    assert.ok(first.path.startsWith(dataBase), "全局档落在数据根之下");
  } finally {
    if (previousBase === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
    else process.env.KNORVIA_DATA_BASE_DIR = previousBase;
    rmSync(cwd, { recursive: true, force: true });
    rmSync(dataBase, { recursive: true, force: true });
  }
});

test("B-sw-8 确认门：干净脚本弹窗（不带 display），编不过放行", () => {
  assert.deepEqual(
    saveWorkflowToolEntry.prepareApproval!({
      name: "n",
      scope: "project",
      description: "d",
      script: CLEAN_SCRIPT,
    }),
    { gate: "ask" },
  );
  assert.deepEqual(
    saveWorkflowToolEntry.prepareApproval!({
      name: "n",
      scope: "project",
      description: "d",
      script: BAD_SCRIPT,
    }),
    { gate: "proceed" },
  );
  assert.deepEqual(saveWorkflowToolEntry.prepareApproval!({ name: "n" }), { gate: "proceed" });
});

test("B-tp-3 SaveWorkflow 工具声明：写仓库的动作，永不持久免确认", () => {
  const entry = saveWorkflowToolEntry;
  assert.equal(entry.metadata.name, "SaveWorkflow");
  assert.equal(entry.metadata.readOnly, false);
  assert.equal(entry.metadata.concurrentSafe, false);
  assert.equal(entry.metadata.sideEffectScope, "workspace");
  assert.equal(entry.metadata.riskLevel, "medium");
  assert.equal(entry.metadata.timeoutMs, 15_000);
  assert.equal(entry.permission.permission, "saveWorkflow");
  assert.equal(entry.permission.alwaysAsk, true);
  assert.deepEqual(entry.permission.askOptions, { allowAlways: false });
  assert.equal(entry.cancellation.supported, false);
  assert.match(entry.metadata.description, /NEVER call this tool unsolicited/u);
  assert.match(entry.metadata.description, /File format:/u);
  assert.match(entry.metadata.description, /Saving over an existing name REPLACES that workflow/u);
  assert.match(entry.metadata.description, /Arguments:/u);
});

test("B-ev-1 片段二选一在入参校验收口", () => {
  assert.deepEqual(evalWorkflowSnippetToolEntry.validateInput!({}), {
    result: false,
    errorCode: 400,
    message: EVAL_SOURCE_ERROR,
  });
  assert.deepEqual(evalWorkflowSnippetToolEntry.validateInput!({ code: "c", path: "p" }), {
    result: false,
    errorCode: 400,
    message: EVAL_SOURCE_ERROR,
  });
  assert.deepEqual(evalWorkflowSnippetToolEntry.validateInput!({ code: "return 1;" }), {
    result: true,
  });
});

test("B-ev-2 path 来源整文件即片段，连元数据块样式的第一行也不剥", async () => {
  const cwd = scratch("evpath");
  try {
    const file = path.join(cwd, "snippet.dwf.ts");
    const source = "/* knorvia-workflow\n*/\nreturn 1;\n";
    writeFileSync(file, source, "utf8");
    const resolved = await evalWorkflowSnippetToolEntry.resolveInput!({ path: "snippet.dwf.ts" }, {
      workingDirectory: cwd,
    } as never);
    assert.deepEqual(resolved, {
      result: true,
      input: { path: file, code: source },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-ev-3 端口缺席：诚实的未执行失败，不假装跑过", async () => {
  const output = await evalWorkflowSnippetToolEntry.handler({ code: "return 1;" }, {
    toolCallId: "c",
    sessionId: "s",
  } as never);
  assert.deepEqual(output, {
    ok: false,
    diagnostics: [],
    logs: [],
    response: UNAVAILABLE_NOTE,
    durationMs: 0,
  });
});

test("B-ev-4 端口在场：诊断/失败/完成三种终态各自成文，超时缺省 60s", async () => {
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const call = async (result: unknown, input: Record<string, unknown>) => {
    const output = await evalWorkflowSnippetToolEntry.handler(input, {
      toolCallId: "call-ev",
      sessionId: "sess",
      turnId: "turn",
      traceId: "trace",
      dynamicWorkflowSnippetPort: {
        evalSnippet: async (payload: Record<string, unknown>) => {
          events.push({ name: "eval", payload });
          return result;
        },
      },
    } as never);
    return output;
  };

  const diagnosed = await call(
    {
      kind: "diagnostics",
      diagnostics: [
        {
          code: 2322,
          column: 7,
          line: 1,
          message: "Type 'string' is not assignable to type 'number'.",
        },
      ],
    },
    { code: BAD_SCRIPT },
  );
  assert.equal(diagnosed.ok, false);
  assert.equal(diagnosed.durationMs >= 0, true);
  assert.equal(
    diagnosed.response,
    [
      "The snippet has errors:",
      "L1:C7 Type 'string' is not assignable to type 'number'.",
      "",
      NOT_EXECUTED_NOTE,
    ].join("\n"),
  );

  const failed = await call(
    {
      kind: "failed",
      error: { code: "TIMEOUT", message: "wall clock exceeded" },
      logs: ["first", "second"],
      logsTruncated: true,
    },
    { code: "return 1;", timeoutMs: 2500 },
  );
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.logs, ["first", "second"]);
  assert.equal(
    failed.response,
    [
      "The snippet failed (TIMEOUT): wall clock exceeded",
      "",
      "Logs:",
      "- first",
      "- second",
      "- … (logs truncated)",
    ].join("\n"),
  );

  const done = await call(
    { kind: "completed", artifact: 42, logs: [], logsTruncated: false },
    { code: "return 1;" },
  );
  assert.equal(done.ok, true);
  assert.match(done.response, /^The snippet completed in \d+ms\.\nReturn value:\n42$/u);

  const empty = await call(
    { kind: "completed", artifact: undefined, logs: [], logsTruncated: false },
    { code: "return 1;" },
  );
  assert.equal(empty.ok, true);
  assert.match(empty.response, /^The snippet completed in \d+ms\.\nIt returned no value\.$/u);

  // 端口看到的墙钟与 trace：缺省 60s，显式值原样传。
  assert.equal(events[0]!.payload.timeoutMs, 60_000);
  assert.equal(events[1]!.payload.timeoutMs, 2500);
  assert.deepEqual(events[0]!.payload.trace, {
    traceId: "trace",
    spanId: undefined,
    parentSpanId: undefined,
    sessionId: "sess",
    turnId: "turn",
  });
  assert.equal(events.length, 4);
});

test("B-ev-5 确认门只落在携带 world.run 的干净片段上", () => {
  const withRun = evalWorkflowSnippetToolEntry.prepareApproval!({
    code: 'const r = await world.run("echo", ["hi"]);\nreturn r.exitCode;\n',
  });
  assert.equal(withRun.gate, "ask");

  assert.deepEqual(evalWorkflowSnippetToolEntry.prepareApproval!({ code: "return 1 + 1;\n" }), {
    gate: "proceed",
  });
  assert.deepEqual(evalWorkflowSnippetToolEntry.prepareApproval!({ code: BAD_SCRIPT }), {
    gate: "proceed",
  });
  assert.deepEqual(evalWorkflowSnippetToolEntry.prepareApproval!({}), { gate: "proceed" });
});

test("B-tp-4 EvalWorkflowSnippet 工具声明：瞬态实验通道，取消 bestEffort", () => {
  const entry = evalWorkflowSnippetToolEntry;
  assert.equal(entry.metadata.name, "EvalWorkflowSnippet");
  assert.equal(entry.metadata.readOnly, false);
  assert.equal(entry.metadata.sideEffectScope, "workspace");
  assert.equal(entry.metadata.timeoutMs, 660_000);
  assert.equal(entry.timeout.defaultMs, 660_000);
  assert.equal(entry.timeout.allowCallOverride, false);
  assert.equal(entry.cancellation.supported, true);
  assert.equal(entry.cancellation.cleanup, "bestEffort");
  assert.equal(entry.cancellation.userVisibleMessage, "Snippet evaluation cancelled");
  assert.equal(entry.permission.permission, "evalWorkflowSnippet");
  assert.equal(entry.permission.alwaysAsk, undefined);
  assert.match(entry.metadata.description, /This is the test bench for workflow authoring/u);
  assert.match(entry.metadata.description, /NOT for orchestration/u);
  assert.ok(entry.metadata.description.includes("```ts"));
});

test("B-sw-9 保存输出的模型面只回 response 文本，坏输出回兜底句", () => {
  assert.equal(
    saveWorkflowToolEntry.formatModelContent!({
      diagnostics: [],
      ok: true,
      response: "Saved.",
      name: "n",
      scope: "project",
      path: "/tmp/x",
    }),
    "Saved.",
  );
  assert.equal(
    saveWorkflowToolEntry.formatModelContent!({ nonsense: true }),
    "SaveWorkflow returned an invalid result.",
  );
  assert.equal(
    evalWorkflowSnippetToolEntry.formatModelContent!({
      ok: true,
      diagnostics: [],
      logs: [],
      response: "Done.",
      durationMs: 1,
    }),
    "Done.",
  );
  assert.equal(
    evalWorkflowSnippetToolEntry.formatModelContent!("nope"),
    "EvalWorkflowSnippet returned an invalid result.",
  );
});
