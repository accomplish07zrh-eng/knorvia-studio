// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-workflow-01 contract tests: AmendWorkflow revision semantics — the three-state
// settings (omit = inherit, null = clear, value = set), the three script sources and the
// predecessor handshake. Port traffic is asserted as an ordered event sequence; no sleeps.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { amendWorkflowToolEntry } from "../../../../apps/cli/packages/core/src/tool/handlers/amend-workflow.js";
import { DIAGNOSTICS_NOT_EXECUTED_NOTE } from "../../../../apps/cli/packages/core/src/tool/handlers/create-workflow.js";
import {
  AMEND_WORKFLOW_ERROR_CODE,
  predecessorNotFoundFailure,
  resolveAmendMaxConcurrency,
  resolveAmendSubagentModelChoice,
  resolveAmendWorkflowInput,
} from "../../../../apps/cli/packages/core/src/tool/handlers/amend-workflow-resolve.js";
import {
  refuseUnchangedScript,
  resolveAmendScript,
  resolveKeptScriptFile,
  scriptUnavailableFailure,
  validateAmendWorkflowSource,
} from "../../../../apps/cli/packages/core/src/tool/handlers/amend-workflow-source.js";

const AMEND_SOURCE_ERROR =
  "Provide at most one revised script: `path` for the script file you edited (the usual form), or `script` for the whole revised script inline. Passing both is ambiguous; omit both to keep the predecessor's script unchanged.";

const CLEAN_SCRIPT = 'phase("Research each changed file in parallel")\nreturn 1;\n';
const BAD_SCRIPT = 'const x: number = "nope";\nreturn x;\n';
const OLD_SCRIPT = 'phase("旧脚本")\nreturn 0;\n';

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
  return mkdtempSync(path.join(tmpdir(), `wf01-aw-${prefix}-`));
}

test("B-aw-1 修订脚本至多给一个；两个都不给是合法的「沿用」", () => {
  assert.deepEqual(validateAmendWorkflowSource({ run_id: "r", script: "s", path: "p" }), {
    result: false,
    errorCode: 400,
    message: AMEND_SOURCE_ERROR,
  });
  assert.deepEqual(validateAmendWorkflowSource({ run_id: "r", script: "s" }), { result: true });
  assert.deepEqual(validateAmendWorkflowSource({ run_id: "r" }), { result: true });
  assert.deepEqual(validateAmendWorkflowSource("nonsense"), { result: true });
});

test("B-aw-2 错误码表是显式语义常量，两处再导出同一对象", () => {
  assert.deepEqual(AMEND_WORKFLOW_ERROR_CODE, {
    AMEND_UNAVAILABLE: 21,
    MISSING_BOUNDARIES: 22,
    SUBAGENT_MODEL: 23,
    SCRIPT_UNCHANGED: 24,
    SCRIPT_FILE: 25,
    SCRIPT_UNAVAILABLE: 26,
  });
});

test("B-aw-3 无脚本可沿用的两种原因同一判别键，文案各自点名", () => {
  assert.deepEqual(scriptUnavailableFailure("run-1", "host"), {
    result: false,
    errorCode: 26,
    message:
      "workflow_amend_script_unavailable: this host cannot read run run-1's stored script, so the script cannot be omitted here — pass the whole script as `script`, or its file as `path`. Nothing was stopped or created.",
  });
  assert.deepEqual(scriptUnavailableFailure("run-1", "record"), {
    result: false,
    errorCode: 26,
    message:
      "workflow_amend_script_unavailable: run run-1 has no stored script to keep (it predates script persistence), so the script cannot be omitted here — pass the whole script as `script`, or its file as `path`. Nothing was stopped or created.",
  });
});

test("B-aw-4 并发上界三态：数=钳制，null=解除，省略=沿用（再钳一次）", () => {
  assert.deepEqual(resolveAmendMaxConcurrency(32, undefined, 8), { max_concurrency: 8 });
  assert.deepEqual(resolveAmendMaxConcurrency(2, undefined, 8), { max_concurrency: 2 });
  assert.deepEqual(resolveAmendMaxConcurrency(null, 4, 8), {});
  assert.deepEqual(resolveAmendMaxConcurrency(undefined, 4, 8), { max_concurrency: 4 });
  assert.deepEqual(
    resolveAmendMaxConcurrency(undefined, 40, 8),
    { max_concurrency: 8 },
    "继承值再钳",
  );
  assert.deepEqual(resolveAmendMaxConcurrency(undefined, undefined, 8), {});
  assert.deepEqual(resolveAmendMaxConcurrency(3, undefined, undefined), { max_concurrency: 3 });
});

test("B-aw-5 子代理模型三态：null=解除，字符串=解析，省略=沿用并重解", () => {
  assert.deepEqual(resolveAmendSubagentModelChoice(null, "prov/mod", catalog()), { ok: true });
  assert.deepEqual(resolveAmendSubagentModelChoice("prov/mod", undefined, catalog()), {
    ok: true,
    canonical: "prov/mod$high",
  });
  assert.deepEqual(resolveAmendSubagentModelChoice(undefined, "prov/mod", catalog()), {
    ok: true,
    canonical: "prov/mod$high",
  });
  assert.deepEqual(resolveAmendSubagentModelChoice(undefined, undefined, catalog()), { ok: true });

  // 目录缺席：模型自己给的字符串拒绝；沿用的原样带过（不把宿主缺口记到用户头上）。
  assert.deepEqual(resolveAmendSubagentModelChoice("prov/mod", undefined, undefined), {
    ok: false,
    inherited: false,
    text: "prov/mod",
    message: "This host cannot choose a subagent model; omit subagent_model.",
  });
  assert.deepEqual(resolveAmendSubagentModelChoice(undefined, "prov/mod", undefined), {
    ok: true,
    canonical: "prov/mod",
  });

  // 沿用的模型已不可用：失败带上继承标记。
  const stale = resolveAmendSubagentModelChoice(undefined, "prov/gone", catalog());
  assert.equal((stale as { ok: boolean }).ok, false);
  assert.equal((stale as { inherited: boolean }).inherited, true);
});

test("B-aw-6 path 来源：块剥掉（声明忽略）、记偏移，读不出点名原因", async () => {
  const cwd = scratch("pathsrc");
  try {
    const file = path.join(cwd, "rev.dwf.ts");
    writeFileSync(
      file,
      "/* knorvia-workflow\ndescription: d\nargs:\n  pr:\n    type: string\n*/\nreturn 1;\n",
      "utf8",
    );
    const resolved = await resolveAmendScript({
      model: { run_id: "run-1", path: "rev.dwf.ts" },
      cwd,
      port: undefined,
      predecessorScriptPath: undefined,
    });
    assert.equal(resolved.result, true);
    if (!resolved.result) return;
    assert.equal(resolved.inherited, false);
    assert.equal(resolved.described, path.relative(cwd, file).split(path.sep).join("/"));
    assert.deepEqual(resolved.fields, {
      script: "return 1;\n",
      path: file,
      script_line_offset: 6,
    });

    const missing = await resolveAmendScript({
      model: { run_id: "run-1", path: "gone.dwf.ts" },
      cwd,
      port: undefined,
      predecessorScriptPath: undefined,
    });
    assert.equal(missing.result, false);
    if (missing.result) return;
    assert.equal(missing.errorCode, 25);
    assert.match(missing.message, /^workflow_script_file_unreadable: The workflow script file /u);
    assert.match(missing.message, /Nothing was stopped or created\.$/u);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-aw-7 沿用前驱脚本：端口缺席/记录缺席各自失败，在场则原样沿用", async () => {
  const cwd = scratch("inherit");
  try {
    const noHost = await resolveAmendScript({
      model: { run_id: "run-1" },
      cwd,
      port: undefined,
      predecessorScriptPath: undefined,
    });
    assert.deepEqual(noHost, scriptUnavailableFailure("run-1", "host"));

    const noGetScript = await resolveAmendScript({
      model: { run_id: "run-1" },
      cwd,
      port: {} as never,
      predecessorScriptPath: undefined,
    });
    assert.deepEqual(noGetScript, scriptUnavailableFailure("run-1", "host"));

    const empty = await resolveAmendScript({
      model: { run_id: "run-1" },
      cwd,
      port: { getScript: async () => "" } as never,
      predecessorScriptPath: undefined,
    });
    assert.deepEqual(empty, scriptUnavailableFailure("run-1", "record"));

    const kept = await resolveAmendScript({
      model: { run_id: "run-1" },
      cwd,
      port: { getScript: async () => OLD_SCRIPT } as never,
      predecessorScriptPath: undefined,
    });
    assert.equal(kept.result, true);
    if (!kept.result) return;
    assert.equal(kept.inherited, true);
    assert.deepEqual(kept.fields, { script: OLD_SCRIPT });
    assert.equal(kept.described, undefined, "前驱没记过脚本文件：不认家");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-aw-8 认家：文件此刻的字节仍是这份脚本才继续记它", async () => {
  const cwd = scratch("keptfile");
  try {
    const file = path.join(cwd, "run.dwf.ts");
    writeFileSync(file, "/* knorvia-workflow\ndescription: d\n*/\nreturn 1;\n", "utf8");

    const same = await resolveKeptScriptFile({
      cwd,
      scriptPath: file,
      script: "return 1;\n",
    });
    assert.deepEqual(same, {
      path: file,
      described: path.relative(cwd, file).split(path.sep).join("/"),
      lineOffset: 3,
    });

    assert.equal(
      await resolveKeptScriptFile({ cwd, scriptPath: file, script: "changed" }),
      undefined,
    );
    assert.equal(
      await resolveKeptScriptFile({ cwd, scriptPath: undefined, script: "x" }),
      undefined,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-aw-9 script_unchanged 预检只网住「忘了编辑」的 path 提交", async () => {
  const port = { getScript: async () => OLD_SCRIPT };
  const base = {
    port: port as never,
    resolvedScript: OLD_SCRIPT,
    described: "run.dwf.ts",
  };

  const refused = await refuseUnchangedScript({
    ...base,
    model: { run_id: "run-1", path: "run.dwf.ts" },
  });
  assert.equal((refused as { errorCode: number }).errorCode, 24);
  assert.match(
    (refused as { message: string }).message,
    /^workflow_script_unchanged: run\.dwf\.ts is byte-for-byte the script run run-1 was started with/u,
  );
  assert.match((refused as { message: string }).message, /use ResumeWorkflowRun/u);
  assert.match((refused as { message: string }).message, /Nothing was stopped or created\./u);

  // 同时改设定的修订有自己的意义，不拦。
  assert.equal(
    await refuseUnchangedScript({
      ...base,
      model: { run_id: "run-1", path: "run.dwf.ts", max_concurrency: 2 },
    }),
    undefined,
  );
  assert.equal(
    await refuseUnchangedScript({
      ...base,
      model: { run_id: "run-1", path: "run.dwf.ts", subagent_model: null },
    }),
    undefined,
  );
  // 内联贴一遍脚本不是「忘了编辑」。
  assert.equal(
    await refuseUnchangedScript({ ...base, model: { run_id: "run-1", script: OLD_SCRIPT } }),
    undefined,
  );
  // 端口没有 getScript：跳过这道便利预检。
  assert.equal(
    await refuseUnchangedScript({
      port: {} as never,
      resolvedScript: OLD_SCRIPT,
      described: "run.dwf.ts",
      model: { run_id: "run-1", path: "run.dwf.ts" },
    }),
    undefined,
  );
});

test("B-aw-10 前驱不存在先收口；端口读序是 getTask → getScript", async () => {
  const cwd = scratch("order");
  try {
    const events: string[] = [];
    const port = {
      getTask: async (id: string) => {
        events.push(`getTask:${id}`);
        return undefined;
      },
      getScript: async (id: string) => {
        events.push(`getScript:${id}`);
        return OLD_SCRIPT;
      },
    };
    const missing = await resolveAmendWorkflowInput({ run_id: "run-1" }, {
      workingDirectory: cwd,
      dynamicWorkflowRunPort: port,
      sessionId: "sess",
    } as never);
    assert.deepEqual(missing, predecessorNotFoundFailure("run-1"));
    assert.deepEqual(events, ["getTask:run-1"], "前驱查找失败后不再读脚本");
    assert.match(
      (missing as { message: string }).message,
      /^run_not_found: no workflow run with ID run-1 exists for this project\. Use ListWorkflowRuns to see the runs that do\./u,
    );
    assert.match(
      (missing as { message: string }).message,
      /Nothing was stopped or created: `run_id` pointed at a run that does not exist/u,
    );

    // 落定脚本（读文件）排在比字节之前。
    events.length = 0;
    const file = path.join(cwd, "rev.dwf.ts");
    writeFileSync(file, OLD_SCRIPT, "utf8");
    await resolveAmendWorkflowInput({ run_id: "run-1", path: "rev.dwf.ts" }, {
      workingDirectory: cwd,
      dynamicWorkflowRunPort: {
        getTask: async (id: string) => {
          events.push(`getTask:${id}`);
          return { runStatus: "running", parentSessionId: "sess" };
        },
        getScript: async (id: string) => {
          events.push(`getScript:${id}`);
          return OLD_SCRIPT;
        },
      },
      sessionId: "sess",
    } as never);
    assert.deepEqual(events, ["getTask:run-1", "getScript:run-1"]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-aw-11 前驱事实块由快照算出并覆盖伪造，沿用时盖 script_inherited", async () => {
  const cwd = scratch("pred");
  try {
    const snapshot = {
      name: "PR review",
      runStatus: "stopped",
      stopReason: "user",
      parentSessionId: "sess",
      maxConcurrency: 4,
      scriptPath: undefined,
    };
    const port = {
      getTask: async () => snapshot,
      getScript: async () => OLD_SCRIPT,
    };
    const resolved = await resolveAmendWorkflowInput(
      {
        run_id: "run-1",
        predecessor: { status: "running", owned_by_this_session: false },
      },
      { workingDirectory: cwd, dynamicWorkflowRunPort: port, sessionId: "sess" } as never,
    );
    const input = (resolved as { input: Record<string, unknown> }).input;
    assert.deepEqual(input.predecessor, {
      name: "PR review",
      status: "stopped",
      stop_reason: "user",
      owned_by_this_session: true,
      script_inherited: true,
    });
    assert.equal(input.script, OLD_SCRIPT);
    assert.deepEqual(input.max_concurrency, 4, "省略即沿用前驱上界");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-aw-12 端口缺席：伪造字段全部剥掉，模型给的数原样过", async () => {
  const cwd = scratch("noport");
  try {
    const resolved = await resolveAmendWorkflowInput(
      {
        run_id: "run-1",
        script: CLEAN_SCRIPT,
        max_concurrency: 2,
        subagent_model: null,
        script_line_offset: 9,
        predecessor: { status: "running", owned_by_this_session: true },
      },
      { workingDirectory: cwd, sessionId: "sess" } as never,
    );
    assert.deepEqual(resolved, {
      result: true,
      input: { run_id: "run-1", script: CLEAN_SCRIPT, max_concurrency: 2 },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-aw-13 编译失败文案分沿用/修订两态，前驱未动写明", async () => {
  const described = path.join(".knorvia-studio", "workflow-drafts", "workflow.dwf.ts");
  const fileNote =
    `NOTE: The workflow was NOT executed. The script is saved at ${described}. ` +
    `Edit that file in place and resubmit with \`path: "${described}"\` — do not paste the script inline again.`;

  // 每次调用独立工作目录：草稿铸名不受撞名顺延影响。
  const call = async (input: Record<string, unknown>, withCwd: boolean) => {
    const cwd = scratch("diag");
    try {
      return await amendWorkflowToolEntry.handler(input, {
        ...(withCwd ? { workingDirectory: cwd } : {}),
        toolCallId: "c",
        sessionId: "s",
      } as never);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  };

  const revised = await call({ run_id: "run-1", script: BAD_SCRIPT }, true);
  assert.equal(revised.ok, false);
  assert.equal(
    revised.response,
    [
      "The revised workflow script has errors:",
      `${described}:L1:C7 Type 'string' is not assignable to type 'number'.`,
      "",
      `${fileNote} Run run-1 was not touched.`,
    ].join("\n"),
  );

  const inherited = await call(
    {
      run_id: "run-1",
      script: BAD_SCRIPT,
      predecessor: { status: "running", owned_by_this_session: true, script_inherited: true },
    },
    true,
  );
  assert.equal(inherited.ok, false);
  assert.equal(
    inherited.response,
    [
      "This amend kept run run-1's script, inherited because you omitted both `script` and `path`, and that script no longer compiles against the current workflow facade:",
      `${described}:L1:C7 Type 'string' is not assignable to type 'number'.`,
      "",
      `${fileNote} Run run-1 was not touched.`,
    ].join("\n"),
  );

  // 草稿写不下去（无工作目录）：文案退回内联老话，沿用时明说 Nothing ran。
  const noFile = await call(
    {
      run_id: "run-1",
      script: BAD_SCRIPT,
      predecessor: { status: "running", owned_by_this_session: true, script_inherited: true },
    },
    false,
  );
  assert.equal(noFile.ok, false);
  assert.equal(
    noFile.response,
    [
      "This amend kept run run-1's script, inherited because you omitted both `script` and `path`, and that script no longer compiles against the current workflow facade:",
      "L1:C7 Type 'string' is not assignable to type 'number'.",
      "",
      "NOTE: Nothing ran — pass a rewritten `script` that compiles. Run run-1 was not touched.",
    ].join("\n"),
  );
  assert.equal(typeof DIAGNOSTICS_NOT_EXECUTED_NOTE, "string");
});

test("B-aw-14 端口缺席回占位；端口无 amend 能力回能力缺口", async () => {
  const cwd = scratch("capability");
  try {
    const noPort = await amendWorkflowToolEntry.handler({ run_id: "run-1", script: CLEAN_SCRIPT }, {
      workingDirectory: cwd,
      toolCallId: "c",
      sessionId: "s",
    } as never);
    assert.equal(noPort.ok, true);
    assert.match(noPort.response, /The revised workflow script compiled cleanly\./u);
    assert.match(noPort.response, /workflow execution is not available in this session/u);

    const noAmend = await amendWorkflowToolEntry.handler(
      { run_id: "run-1", script: CLEAN_SCRIPT },
      {
        workingDirectory: cwd,
        toolCallId: "c",
        sessionId: "s",
        dynamicWorkflowRunPort: { getTask: async () => ({}) },
      } as never,
    );
    assert.equal((noAmend as { result: boolean }).result, false);
    assert.equal((noAmend as { errorCode: number }).errorCode, 21);
    assert.match(
      (noAmend as { message: string }).message,
      /^workflow_amend_unavailable: this session cannot amend workflow runs/u,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-aw-15 端口拒绝理由各自配可操作文案，未知理由也回结构化失败", async () => {
  const cwd = scratch("refusal");
  try {
    const make = (reason: string) =>
      amendWorkflowToolEntry.handler({ run_id: "run-1", script: CLEAN_SCRIPT }, {
        workingDirectory: cwd,
        toolCallId: "c",
        sessionId: "s",
        dynamicWorkflowRunPort: { amend: async () => ({ ok: false, reason }) },
      } as never);

    const notFound = await make("run_not_found");
    assert.equal((notFound as { errorCode: number }).errorCode, 2);
    assert.match((notFound as { message: string }).message, /^run_not_found: /u);

    const boundaries = await make("missing_boundaries");
    assert.equal((boundaries as { errorCode: number }).errorCode, 22);
    assert.match(
      (boundaries as { message: string }).message,
      /^workflow_amend_missing_boundaries: run run-1's journal predates transcript-boundary bookkeeping/u,
    );

    const other = await make("something_new");
    assert.equal((other as { errorCode: number }).errorCode, 22);
    assert.match(
      (other as { message: string }).message,
      /^workflow_amend_refused: the workflow runtime refused to amend run run-1 \(reason: something_new\)/u,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-aw-16 成功路径：被替代者两种结局、沿用/修订两套引导", async () => {
  const draftRel = path.join(
    ".knorvia-studio",
    "workflow-drafts",
    "Research-each-changed-file-in-parallel.dwf.ts",
  );
  const tail =
    " It is still running — you will be notified with the final output when it completes. " +
    "Do not wait for it or poll it with TaskOutput; continue with other work unless the user asked you to wait.";

  const run = async (amendResult: unknown, extra: Record<string, unknown> = {}) => {
    // 每次调用独立工作目录：草稿铸名不受撞名顺延影响。
    const cwd = scratch("success-run");
    try {
      const events: string[] = [];
      const output = await amendWorkflowToolEntry.handler(
        { run_id: "run-1", script: CLEAN_SCRIPT, ...extra },
        {
          workingDirectory: cwd,
          toolCallId: "call-9",
          sessionId: "sess",
          dynamicWorkflowRunPort: {
            amend: async (payload: Record<string, unknown>) => {
              events.push("amend");
              assert.equal(payload.predecessorRunId, "run-1");
              assert.equal(payload.scriptText, CLEAN_SCRIPT);
              return amendResult;
            },
            concurrencyCeiling: () => 8,
          },
        } as never,
      );
      return { output, events };
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  };

  const settled = await run({ ok: true, runId: "run-2" });
  assert.deepEqual(settled.events, ["amend"]);
  assert.equal(settled.output.status, "backgrounded");
  assert.equal(settled.output.backgroundTaskId, "run-2");
  assert.equal(
    settled.output.response,
    "Run run-1 had already settled; its finished work is imported as cache. " +
      "The revised script started in the background as run run-2." +
      tail +
      ` The revision's script is at ${draftRel}; edit it there for a further revision.`,
  );

  const superseded = await run(
    { ok: true, runId: "run-3", supersededRunId: "run-1" },
    {
      predecessor: { status: "running", owned_by_this_session: true, script_inherited: true },
      max_concurrency: 2,
    },
  );
  assert.equal(
    superseded.output.response,
    "Run run-1 was still running: it has been stopped and superseded, and everything it finished before the stop is imported as cache. It will not send a notification of its own. " +
      "The script of run run-1 started unchanged in the background as run run-3." +
      tail +
      " At most 2 subagents run at once." +
      ` The revision's script is at ${draftRel}; edit it there for a further revision.`,
  );
});

test("B-aw-17 确认门与 CreateWorkflow 同一段：编不过放行，干净弹窗带修订名 display", () => {
  assert.deepEqual(amendWorkflowToolEntry.prepareApproval!({ run_id: "r", script: BAD_SCRIPT }), {
    gate: "proceed",
  });
  assert.deepEqual(amendWorkflowToolEntry.prepareApproval!({ run_id: "r" }), { gate: "proceed" });
  const ask = amendWorkflowToolEntry.prepareApproval!({ run_id: "r", script: CLEAN_SCRIPT });
  assert.equal(ask.gate, "ask");
  assert.equal((ask as { display?: { kind?: string } }).display?.kind, "create_workflow");
});

test("B-tp-2 AmendWorkflow 工具声明：与 CreateWorkflow 同门，输出同形", () => {
  const entry = amendWorkflowToolEntry;
  assert.equal(entry.metadata.name, "AmendWorkflow");
  assert.equal(entry.metadata.readOnly, false);
  assert.equal(entry.metadata.timeoutMs, 15_000);
  assert.equal(entry.permission.permission, "createWorkflow");
  assert.equal(entry.permission.alwaysAsk, true);
  assert.deepEqual(entry.permission.askOptions, { allowAlways: "session" });
  assert.equal(entry.cancellation.supported, false);
  assert.equal(entry.metadata.needsApproval, true);
  assert.match(entry.metadata.description, /every field you omit keeps the predecessor's value/u);
  assert.match(entry.metadata.description, /`script_unchanged`/u);
  assert.match(entry.metadata.description, /How the cache works:/u);
});
