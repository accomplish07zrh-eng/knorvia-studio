import assert from "node:assert/strict";
import { test } from "node:test";
import { input, messageFixture } from "./git-message-generator-fixture-fast-20261001.js";
const f = await messageFixture();
const success = (raw: string, message = raw.trim()) => ({
  raw,
  message,
  reason: null,
  preview: undefined,
});
const rejected = (raw: string, preview: string | undefined, reason = "invalid") => ({
  raw,
  message: undefined,
  reason,
  preview,
});
const cases = [
  ...[
    "feat",
    "fix",
    "docs",
    "style",
    "refactor",
    "perf",
    "test",
    "build",
    "ci",
    "chore",
    "revert",
  ].map((type) => success(`${type}: owned subject`)),
  success("feat(owned): subject"),
  success("fix!: subject"),
  success("feat(owned scope)!: subject"),
  success("fix( ): subject"),
  success("fix: " + "x".repeat(100)),
  rejected("fix: " + "x".repeat(101), "fix: " + "x".repeat(101)),
  success("fix: " + "😀".repeat(50)),
  rejected("fix: " + "😀".repeat(51), "fix: " + "😀".repeat(51)),
  success("fix: 修复拥有的合成内容"),
  success("fix: owned\r\n\r\nOwned body"),
  success(" \nfix: owned\n body \n", "fix: owned\n body"),
  success("fix: owned\n" + "x".repeat(1100), "fix: owned\n" + "x".repeat(989)),
  success("fix: owned\n" + "😀".repeat(600), ("fix: owned\n" + "😀".repeat(600)).slice(0, 1000)),
  success('"fix: owned"', "fix: owned"),
  success("'fix: owned'", "fix: owned"),
  success("COMMIT MESSAGE: fix: owned", "fix: owned"),
  success("```text\nfix: owned\n```", "fix: owned"),
  success("```plain-text\ncommit message: 'fix: owned'\n```", "fix: owned"),
  success("```\nfix: owned\n```", "fix: owned"),
  rejected("```fix: owned```", ": owned"),
  rejected('"commit message: fix: owned"', "commit message: fix: owned"),
  rejected("```text\n\n```", undefined, "empty"),
  rejected("commit message: ", undefined, "empty"),
  rejected('""', undefined, "empty"),
  rejected("''", undefined, "empty"),
  ...[
    "FIX: owned",
    "unknown: owned",
    "fix:owned",
    "fix: ",
    "fix(): owned",
    "fix(scope)): owned",
    "fix!!: owned",
    " fix owned ",
    "fix: owned\u2028more",
    "explanation\nfix: owned",
  ].map((raw) => rejected(raw, raw.trim().split(/\r?\n/, 1)[0])),
  rejected("x".repeat(1400), "x".repeat(1000)),
];
for (const [index, c] of cases.entries())
  test(`frozen output grammar/decorations/Unicode #${index}`, async () => {
    const g = f.generator();
    g.state.response.text = c.raw;
    if (c.message !== undefined) {
      assert.deepEqual(await g.api.generate(input()), {
        message: c.message,
        providerId: "owned-provider",
        model: "owned-model",
      });
      assert.deepEqual(g.state.trace, ["lookup", "info", "text"]);
      if (index === 23) assert.equal(c.message.charCodeAt(999), 0xd83d);
      return;
    }
    await assert.rejects(g.api.generate(input()), (error: any) => {
      assert.equal(error.name, "GitCommitMessageGenerationError");
      assert.equal(error.message, "模型没有返回可用的 Conventional Commit 提交消息。");
      assert.equal(error.reason, "invalid-output");
      assert.equal(error.detail, c.preview);
      assert.equal(Object.hasOwn(error, "detail"), true);
      assert.equal(Object.hasOwn(error, "cause"), false);
      return true;
    });
    assert.deepEqual(g.state.trace, ["lookup", "info", "text", "debug"]);
    assert.deepEqual(g.state.logs[1]!.args, [
      undefined,
      "模型生成的 Git 提交消息不合规",
      {
        workspacePath: input().workspacePath,
        providerId: "owned-provider",
        model: "owned-model",
        reason: c.reason,
        preview: c.preview,
      },
    ]);
  });
for (const [index, text] of [
  undefined,
  null,
  0,
  {},
  [],
  new String("fix: owned"),
  "",
  " \r\n\t ",
].entries())
  test(`malformed/nonblank response requirement #${index}`, async () => {
    const g = f.generator();
    g.state.response.text = text;
    await assert.rejects(g.api.generate(input()), (error: any) => {
      assert.equal(error.name, "GitCommitMessageGenerationError");
      assert.equal(error.message, "模型请求失败。");
      assert.equal(error.reason, "request-failed");
      assert.equal(error.detail, "模型响应缺少文本内容。");
      assert.equal(Object.hasOwn(error, "cause"), false);
      return true;
    });
    assert.deepEqual(g.state.trace, ["lookup", "info", "text"]);
  });
