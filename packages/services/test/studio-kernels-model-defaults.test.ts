import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { inspectStudioKernelOptions } from "../src/studio-runtime/adapters/kernels/modelOptions.js";
import { kernels, setup, inferenceMessages } from "./studio-kernels-model.fixture.js";

test("清除选择后同一原生会话回到 CLI 默认，而非上轮模型或目录推荐", async (t) => {
  for (const kernel of kernels)
    await t.test(kernel, async () => {
      const context = await setup({ actualDefault: true });
      try {
        const first = await context.run(
          kernel,
          kernel === "grok-build" ? { model: "grok-expensive", reasoningEffort: "high" } : {},
        );
        assert.equal(first.status, "succeeded", first.error);
        const cleared = await context.run(kernel, {
          nativeSessionId: first.nativeSessionId,
          model: undefined,
          reasoningEffort: undefined,
        });
        assert.equal(cleared.status, "succeeded", cleared.error);
        assert.equal(cleared.nativeSessionId, first.nativeSessionId);
        const wire = await context.readLines("wire.jsonl");
        assert.equal(inferenceMessages(wire).length, 2);
        if (kernel === "codex") {
          const starts = wire.filter((message) => message.method === "turn/start");
          assert.equal(starts[0].params.model, "gpt-5.6-luna");
          assert.equal(starts[1].params.model, "gpt-5.6-terra");
          assert.equal(starts[1].params.effort, "ultra");
          const options = await inspectStudioKernelOptions({
            kernel,
            executable: context.executable,
            cwd: context.directory,
          });
          assert.equal(options.defaultModel, "gpt-5.6-terra");
          assert.equal(
            options.models.find((model) => model.id === "gpt-5.6-terra")?.defaultReasoning,
            "ultra",
          );
          assert.ok(!JSON.stringify(options).includes("must-not-leave-process"));
        } else if (kernel === "claude-code") {
          const args = await context.readLines("argv.jsonl");
          assert.ok(!args[1].includes("--model") && !args[1].includes("--effort"));
          const modelReset = wire.findIndex((message) => message.request?.subtype === "set_model");
          const effortReset = wire.findIndex(
            (message) => message.request?.subtype === "apply_flag_settings",
          );
          assert.deepEqual(wire[modelReset].request, { subtype: "set_model" });
          assert.deepEqual(wire[effortReset].request.settings, { effortLevel: null });
          const lastUser = wire.map((message) => message.type).lastIndexOf("user");
          assert.ok(modelReset < lastUser);
          assert.ok(effortReset < lastUser);
        } else {
          const models = wire.filter((message) => message.method === "session/set_model");
          const efforts = wire.filter((message) => message.method === "session/set_config_option");
          assert.deepEqual(
            models.map((message) => message.params.modelId),
            ["grok-expensive", "grok-4.7"],
          );
          assert.deepEqual(
            efforts.map((message) => message.params.value),
            ["high", "economy"],
          );
        }
      } finally {
        await context.cleanup();
      }
    });
});

async function configuredDefaultFixture(
  options: { effort?: string; wrongEcho?: boolean; rejectTurn?: boolean } = {},
) {
  const context = await setup();
  const config = {
    model: "gpt-6-astra",
    ...(options.effort ? { model_reasoning_effort: options.effort } : {}),
  };
  let source = await readFile(context.executable.path, "utf8");
  source = source.replace(
    /if\(method==='config\/read'\)[^\n]+/,
    `if(method==='config/read') return reply(id,{config:${JSON.stringify(config)}});`,
  );
  if (options.wrongEcho)
    source = source.replace("model:m.params.model||'gpt-5.6-luna'", "model:'unexpected-model'");
  if (options.rejectTurn)
    source = source.replace(
      "if(method==='turn/start') {",
      "if(method==='turn/start') { return send({id,error:{code:-32602,message:'native rejected configured model or effort'}});",
    );
  await writeFile(context.executable.path, source);
  return context;
}

test("目录外真实 CLI 默认可恢复，仍由原生回显验证且不向 UI 伪造选项", async () => {
  const context = await configuredDefaultFixture({ effort: "max" });
  try {
    const options = await inspectStudioKernelOptions({
      kernel: "codex",
      executable: context.executable,
      cwd: context.directory,
    });
    assert.equal(options.defaultModel, "gpt-6-astra");
    assert.ok(!options.models.some((model) => model.id === "gpt-6-astra"));
    assert.ok(!("configuredDefault" in options));
    const first = await context.run("codex");
    assert.equal(first.status, "succeeded", first.error);
    const cleared = await context.run("codex", {
      nativeSessionId: first.nativeSessionId,
      model: undefined,
      reasoningEffort: undefined,
    });
    assert.equal(cleared.status, "succeeded", cleared.error);
    assert.equal(cleared.nativeSessionId, first.nativeSessionId);
    const wire = await context.readLines("wire.jsonl");
    const resume = wire.find((message) => message.method === "thread/resume");
    assert.equal(resume.params.model, "gpt-6-astra");
    assert.equal(resume.params.allowProviderModelFallback, false);
    const starts = wire.filter((message) => message.method === "turn/start");
    assert.deepEqual(
      starts.map((message) => [message.params.model, message.params.effort]),
      [
        ["gpt-5.6-luna", "low"],
        ["gpt-6-astra", "max"],
      ],
    );
    for (const reasoningEffort of ["max", "invented-effort"]) {
      const explicit = await context.run("codex", {
        nativeSessionId: first.nativeSessionId,
        model: "gpt-6-astra",
        reasoningEffort,
      });
      assert.equal(explicit.status, "failed");
      assert.equal(explicit.resultKnown, true);
    }
    assert.equal(inferenceMessages(await context.readLines("wire.jsonl")).length, 2);
  } finally {
    await context.cleanup();
  }
});

test("目录外默认缺少 effort、回显不符或原生拒绝时不回退其他模型", async (t) => {
  for (const options of [
    {},
    { effort: "max", wrongEcho: true },
    { effort: "bad-config-value", rejectTurn: true },
  ])
    await t.test(JSON.stringify(options), async () => {
      const context = await configuredDefaultFixture(options);
      try {
        const result = await context.run("codex", {
          nativeSessionId: "native-session",
          model: undefined,
          reasoningEffort: undefined,
        });
        assert.equal(result.status, "failed");
        assert.equal(result.resultKnown, true);
        const wire = await context.readLines("wire.jsonl");
        const starts = inferenceMessages(wire);
        assert.equal(starts.length, "rejectTurn" in options ? 1 : 0);
        assert.ok(
          starts.every((message) => (message.params as { model: string }).model === "gpt-6-astra"),
        );
      } finally {
        await context.cleanup();
      }
    });
});
