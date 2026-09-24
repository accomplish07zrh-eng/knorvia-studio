import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectStudioKernelOptions } from "../src/studio-runtime/adapters/kernels/modelOptions.js";
import { kernels, setup, inferenceMessages } from "./studio-kernels-model.fixture.js";

test("模型目录仅查询能力：分页完整、别名正确、隐藏模型不展示、不虚构思考选项", async (t) => {
  for (const kernel of kernels)
    await t.test(kernel, async () => {
      const context = await setup();
      try {
        const options = await inspectStudioKernelOptions({
          kernel,
          executable: context.executable,
          cwd: context.directory,
        });
        assert.equal(options.error, undefined);
        if (kernel === "codex") {
          assert.deepEqual(
            options.models.map((model) => model.id),
            ["gpt-5.6-luna", "gpt-5.6-terra"],
          );
          assert.equal(options.defaultModel, "gpt-5.6-luna");
          assert.equal(options.models[0].defaultReasoning, "medium");
          assert.deepEqual(
            options.models[1].reasoning.map((option) => option.id),
            ["ultra"],
          );
        } else if (kernel === "claude-code") {
          assert.deepEqual(
            options.models.map((model) => model.id),
            ["default", "sonnet", "haiku"],
          );
          assert.deepEqual(options.models[2].reasoning, []);
          assert.equal(options.models[1].defaultReasoning, undefined);
        } else {
          assert.equal(options.defaultModel, "grok-4.7");
          assert.equal(options.models[0].defaultReasoning, "economy");
          assert.deepEqual(options.models[0].reasoning[0], { id: "economy", label: "Low" });
          assert.deepEqual(options.models[1].reasoning, []);
        }
        const messages = await context.readLines("wire.jsonl");
        assert.equal(inferenceMessages(messages).length, 0);
        assert.ok(
          messages.every((message) =>
            [
              "initialize",
              "initialized",
              "model/list",
              "config/read",
              "authenticate",
              "session/new",
            ].includes(message.request?.subtype || message.method),
          ),
        );
        if (kernel === "claude-code") {
          const args = (await context.readLines("argv.jsonl"))[0];
          assert.ok(args.includes("--safe-mode") && args.includes("--no-session-persistence"));
        }
      } finally {
        await context.cleanup();
      }
    });
});

test("Grok native slash commands are read from its session without sending a prompt", async () => {
  const context = await setup({
    nativeCommands: [{ name: "review", description: "Review changes", input: { hint: "[path]" } }],
  });
  try {
    const options = await inspectStudioKernelOptions({
      kernel: "grok-build",
      executable: context.executable,
      cwd: context.directory,
    });
    assert.deepEqual(options.commands, [
      { name: "review", description: "Review changes", inputHint: "[path]" },
    ]);
    assert.equal(inferenceMessages(await context.readLines("wire.jsonl")).length, 0);
  } finally {
    await context.cleanup();
  }
});

test("Codex status and compact slash actions use app-server RPC without a model prompt", async () => {
  const context = await setup();
  try {
    const options = await inspectStudioKernelOptions({
      kernel: "codex",
      executable: context.executable,
      cwd: context.directory,
    });
    assert.deepEqual(
      options.commands?.map((item) => item.name),
      ["status", "compact"],
    );
    const status = await context.run("codex", {
      text: "/status",
      nativeSessionId: "native-session",
    });
    assert.equal(status.status, "succeeded", status.error);
    assert.match(status.text, /Codex 会话/);
    const compact = await context.run("codex", {
      text: "/compact",
      nativeSessionId: "native-session",
    });
    assert.equal(compact.status, "succeeded", compact.error);
    const wire = await context.readLines("wire.jsonl");
    assert.equal(inferenceMessages(wire).length, 0);
    assert.ok(wire.some((item) => item.method === "thread/read"));
    assert.ok(wire.some((item) => item.method === "thread/compact/start"));
  } finally {
    await context.cleanup();
  }
});

test("模型和思考选择传入实际原生字段，续轮保留原生会话", async (t) => {
  for (const kernel of kernels)
    await t.test(kernel, async () => {
      const context = await setup();
      try {
        const first = await context.run(kernel);
        assert.equal(first.status, "succeeded", first.error);
        assert.equal(first.text, "fixture reply");
        const second = await context.run(kernel, { nativeSessionId: first.nativeSessionId });
        assert.equal(second.status, "succeeded", second.error);
        assert.equal(second.nativeSessionId, first.nativeSessionId);
        const wire = await context.readLines("wire.jsonl");
        assert.equal(inferenceMessages(wire).length, 2);
        if (kernel === "codex") {
          const starts = wire.filter((message) => message.method === "turn/start");
          assert.ok(
            starts.every(
              (message) =>
                message.params.model === "gpt-5.6-luna" && message.params.effort === "low",
            ),
          );
          assert.ok(
            wire.some(
              (message) =>
                message.method === "thread/resume" &&
                message.params.threadId === first.nativeSessionId,
            ),
          );
        } else if (kernel === "claude-code") {
          const args = await context.readLines("argv.jsonl");
          assert.ok(
            args.every(
              (values: string[]) =>
                values[values.indexOf("--effort") + 1] === "low" &&
                values[values.indexOf("--model") + 1] === "sonnet",
            ),
          );
          assert.ok(args[1].includes(`--resume=${first.nativeSessionId}`));
          assert.ok(args.every((values: string[]) => !values.includes("--fallback-model")));
        } else {
          const switches = wire.filter((message) => message.method === "session/set_config_option");
          assert.equal(switches.length, 2);
          assert.ok(
            switches.every(
              (message) =>
                message.params.configId === "reasoning_effort" &&
                message.params.value === "economy",
            ),
          );
          assert.ok(
            wire.some(
              (message) =>
                message.method === "session/load" &&
                message.params.sessionId === first.nativeSessionId,
            ),
          );
          assert.ok(
            wire.findIndex((message) => message.method === "session/set_config_option") <
              wire.findIndex((message) => message.method === "session/prompt"),
          );
        }
      } finally {
        await context.cleanup();
      }
    });
});

test("未知思考选项在发出任何用户输入前失败，不能忽略后运行默认档", async (t) => {
  for (const kernel of kernels)
    await t.test(kernel, async () => {
      const context = await setup();
      try {
        const result = await context.run(kernel, { reasoningEffort: "imaginary-effort" });
        assert.equal(result.status, "failed");
        assert.equal(result.resultKnown, true);
        assert.match(result.error || "", /不支持思考档位/);
        assert.equal(inferenceMessages(await context.readLines("wire.jsonl")).length, 0);
      } finally {
        await context.cleanup();
      }
    });
});

test("Claude 不给 Haiku 伪造 effort；完整模型名与目录别名匹配", async () => {
  const context = await setup();
  try {
    const unsupported = await context.run("claude-code", { model: "haiku" });
    assert.equal(unsupported.status, "failed");
    assert.match(unsupported.error || "", /未提供可设置/);
    const unknownCurrent = await context.run("claude-code", { model: undefined });
    assert.equal(unknownCurrent.status, "failed");
    assert.equal(inferenceMessages(await context.readLines("wire.jsonl")).length, 0);
    const resolved = await context.run("claude-code", { model: "claude-sonnet-test" });
    assert.equal(resolved.status, "succeeded", resolved.error);
  } finally {
    await context.cleanup();
  }
});

test("Grok 回显档位未采用或被路由到不同模型时不能继续发 prompt", async (t) => {
  for (const scenario of [{ ignoreEffort: true }, { reroute: true }])
    await t.test(JSON.stringify(scenario), async () => {
      const context = await setup(scenario);
      try {
        const result = await context.run("grok-build");
        assert.equal(result.status, "failed");
        assert.match(result.error || "", /未采用指定思考档位|切换了模型/);
        assert.equal(inferenceMessages(await context.readLines("wire.jsonl")).length, 0);
      } finally {
        await context.cleanup();
      }
    });
});

test("目录为空和循环分页明确报错，不把错误包装成可选默认模型", async () => {
  for (const scenario of [{ empty: true }, { repeatCursor: true }]) {
    const context = await setup(scenario);
    try {
      const options = await inspectStudioKernelOptions({
        kernel: "codex",
        executable: context.executable,
        cwd: context.directory,
      });
      assert.deepEqual(options.models, []);
      assert.match(options.error || "", /未返回模型目录|分页标记/);
      assert.equal(inferenceMessages(await context.readLines("wire.jsonl")).length, 0);
    } finally {
      await context.cleanup();
    }
  }
});

test("正在握手的目录查询可取消并收回自有进程", { timeout: 5000 }, async () => {
  const context = await setup({ hang: true });
  const controller = new AbortController();
  try {
    const pending = inspectStudioKernelOptions({
      kernel: "codex",
      executable: context.executable,
      cwd: context.directory,
      signal: controller.signal,
    });
    for (
      let attempt = 0;
      attempt < 100 && !(await context.readLines("wire.jsonl")).length;
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    const result = await pending;
    assert.match(result.error || "", /取消/);
    assert.equal(inferenceMessages(await context.readLines("wire.jsonl")).length, 0);
  } finally {
    await context.cleanup();
  }
});
