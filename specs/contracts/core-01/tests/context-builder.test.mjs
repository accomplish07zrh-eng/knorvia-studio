// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：context 子块 3（X10 skills 清单、X11 builder 装配顺序与 meta_user 组装）。
// 入口用本区公开桶 `src/context/index.ts`（包根在 tsx 下不可加载，见 known-differences.md §2）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const context = await loadFile("context/index");

const skill = (overrides = {}) => ({
  name: "review",
  description: "review things",
  path: "/skills/review/SKILL.md",
  ...overrides,
});
const outcome = (skills) => ({ skills, diagnostics: [], totalDiscovered: skills.length });

test("X10 Skills section（排序、250 字截断、别名、budget 回落）", () => {
  const { buildSkillsSection } = context;
  assert.equal(buildSkillsSection({ outcome: outcome([]) }), null, "没有 skill 就不产出该段");

  const sorted = buildSkillsSection({
    outcome: outcome([skill({ name: "b", path: "/skills/b/SKILL.md" }), skill({ name: "a", path: "/skills/a/SKILL.md" })]),
  });
  assert.equal(sorted.name, "Skills");
  assert.equal(sorted.source, "skills");
  assert.equal(sorted.injectionTarget, "meta_user");
  assert.equal(sorted.cacheHint, "dynamic");
  assert.equal(sorted.chars, sorted.content.length);
  assert.equal(sorted.tokens, context.estimateTokens(sorted.content));
  assert.ok(
    sorted.content.startsWith("The following skills are available for use with the Skill tool:\n\n"),
  );
  const lines = sorted.content.split("\n").filter((line) => line.startsWith("- "));
  assert.deepEqual(lines, [
    "- a: review things (file: /skills/a/SKILL.md)",
    "- b: review things (file: /skills/b/SKILL.md)",
  ]);

  const withWhen = buildSkillsSection({
    outcome: outcome([skill({ whenToUse: "when reviewing PRs" })]),
  });
  assert.ok(withWhen.content.includes("- review: review things - when reviewing PRs (file: /skills/review/SKILL.md)"));

  const withAlias = buildSkillsSection({
    outcome: outcome([skill({ qualifiedName: "acme:review" })]),
  });
  assert.ok(
    withAlias.content.includes("- acme:review: review things (also loadable as review) (file: /skills/review/SKILL.md)"),
  );

  const longDescription = "x".repeat(300);
  const truncated = buildSkillsSection({ outcome: outcome([skill({ description: longDescription })]) });
  assert.ok(truncated.content.includes(`${"x".repeat(249)}...`), "描述截到 249 字后加省略号");
  assert.ok(!truncated.content.includes("x".repeat(250)));

  const fallback = buildSkillsSection({ outcome: outcome([skill()]), metadataBudget: 1 });
  assert.ok(fallback.content.includes("- review (file: /skills/review/SKILL.md)"), "超预算时回落为只列名字");
  assert.ok(!fallback.content.includes("review things"));
});

test("X11 builder 装配顺序与 meta_user 组装（逐字冻结）", async () => {
  const envInfo = { cwd: "/w", platform: "linux", isGitRepository: false, nodeVersion: "v24.0.0" };
  const builder = context.createContextBuilder({ workingDirectory: "/w", envInfo });
  const result = await builder.build();

  assert.deepEqual(Object.keys(result).sort(), [
    "metaUserAttachments",
    "sections",
    "systemMessages",
    "totalChars",
    "totalTokens",
  ]);
  assert.deepEqual(
    result.sections.map((section) => section.name),
    ["CLI Prefix", "Agent Identity", "Dynamic Behavior", "Environment Info", "Context Management"],
    "最小配置下的装配顺序是兼容面",
  );
  assert.deepEqual(
    result.sections.map((section) => section.source),
    ["cli_prefix", "identity", "dynamic_behavior", "env_info", "context_management"],
  );
  assert.deepEqual(
    result.sections.map((section) => section.injectionTarget),
    ["system", "system", "system", "system", "system"],
  );
  assert.equal(
    result.totalChars,
    result.sections.reduce((total, section) => total + section.chars, 0),
  );
  assert.equal(
    result.totalTokens,
    result.sections.reduce((total, section) => total + section.tokens, 0),
  );

  const metaSections = [context.buildCliPrefixSection(), context.buildCurrentDateSection("2026-01-05")];
  assert.equal(
    context.buildContextMetaUserBody(metaSections),
    "As you answer the user's questions, you can use the following context:\n" +
      "You are Knorvia Studio, an interactive coding agent\n\n" +
      "# currentDate\nToday's date is 2026-01-05.\n\n" +
      "      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.",
  );
  assert.equal(context.buildContextMetaUserBody([]), null, "没有 meta_user 段就不产出正文");
  // 实测语义：该函数**不按 injectionTarget 过滤**，传进来的段一律按顺序拼进正文，由调用方决定传什么。
  assert.equal(
    context.buildContextMetaUserBody([context.buildIdentitySection()]),
    `As you answer the user's questions, you can use the following context:\n${context.buildIdentitySection().content}\n\n      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.`,
  );
  assert.equal(
    context.buildSkillsMetaUserBody(metaSections),
    "You are Knorvia Studio, an interactive coding agent\n\n# currentDate\nToday's date is 2026-01-05.",
    "skills 正文只拼接 meta_user 段内容，无外层包裹",
  );
});
