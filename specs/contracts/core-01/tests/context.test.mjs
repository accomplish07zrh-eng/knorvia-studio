// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：context 子块（X1–X5）。入口用本区公开桶 `src/context/index.ts`
// （包根在 tsx 下不可加载，见 known-differences.md §2）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const context = await loadFile("context/index");

test("X1 token 估算单位与前缀截断（逐字冻结权重）", () => {
  const { countTokenEstimateUnits, estimateTokens, tokenEstimatePrefixLength } = context;

  assert.equal(countTokenEstimateUnits(""), 0);
  assert.equal(countTokenEstimateUnits("abc"), 3);
  assert.equal(countTokenEstimateUnits("中文"), 4, "CJK 权重 2");
  assert.equal(countTokenEstimateUnits("a中"), 3);

  assert.equal(tokenEstimatePrefixLength("abcdef", 3), 3);
  assert.equal(tokenEstimatePrefixLength("abcdef", 0), 0);
  assert.equal(tokenEstimatePrefixLength("abc", 99), 3);
  assert.equal(tokenEstimatePrefixLength("中中中", 3), 1, "CJK 权重下第 2 个字就越界");
  assert.equal(tokenEstimatePrefixLength("", 5), 0);

  // 除数（@knorvia/shared 的 ESTIMATED_TOKEN_CHAR_DIVISOR）实测为 3：向上取整。
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("a"), 1);
  assert.equal(estimateTokens("a".repeat(4)), 2);
  assert.equal(estimateTokens("a".repeat(8)), 3);
  assert.equal(estimateTokens("a".repeat(100)), 34);
  assert.equal(estimateTokens("a".repeat(1000)), 334);
  assert.equal(estimateTokens("中"), 1, "CJK 两个单位仍是一个 token");
});

test("X2 CLI Prefix section（逐字冻结）", () => {
  assert.deepEqual(context.buildCliPrefixSection(), {
    name: "CLI Prefix",
    source: "cli_prefix",
    injectionTarget: "system",
    cacheHint: "stable",
    chars: 51,
    tokens: 17,
    content: "You are Knorvia Studio, an interactive coding agent",
    preview: "You are Knorvia Studio, an interactive coding agent",
  });
});

test("X3 Current Date section（逐字冻结）", () => {
  assert.equal(context.buildCurrentDateSection(undefined), null);
  assert.equal(context.buildCurrentDateSection(""), null);
  assert.deepEqual(context.buildCurrentDateSection("2026-01-05"), {
    name: "Current Date",
    source: "current_date",
    injectionTarget: "meta_user",
    cacheHint: "dynamic",
    chars: 41,
    tokens: 14,
    content: "# currentDate\nToday's date is 2026-01-05.",
    preview: "# currentDate\nToday's date is 2026-01-05.",
  });
});

test("X4 Memory section（标题/路径插值/关键标记）", () => {
  assert.equal(context.buildMemorySection(undefined), null);
  assert.equal(context.buildMemorySection(""), null);

  const section = context.buildMemorySection("/tmp/mem");
  assert.equal(section.name, "Memory");
  assert.equal(section.source, "memory");
  assert.equal(section.injectionTarget, "system");
  assert.equal(section.cacheHint, "dynamic");
  assert.equal(section.chars, section.content.length);
  assert.equal(section.tokens, context.estimateTokens(section.content));
  assert.ok(section.content.startsWith("# Memory\n\n"));
  assert.ok(section.content.includes("persistent file-based memory at `/tmp/mem/`"));
  assert.ok(section.content.includes("do not run mkdir or check for its existence"));
  for (const kind of ["user", "feedback", "project", "reference"]) {
    assert.ok(section.content.includes(kind), `memory 类型 ${kind} 必须出现`);
  }
  assert.ok(section.content.includes("[[name]]"), "关联写法必须出现");
  assert.ok(section.content.includes("`MEMORY.md`"), "索引文件指引必须出现");
  assert.ok(section.content.includes("`- [Title](file.md) — hook`"));
});

test("X5 context 区公开面（区域桶）", () => {
  const expected = [
    "ContextBuilder",
    "buildCliPrefixSection",
    "buildContextMetaUserBody",
    "buildCurrentDateSection",
    "buildDesktopContextSection",
    "buildEnvInfoSection",
    "buildGitSystemContextSection",
    "buildIdentitySection",
    "buildMemorySection",
    "buildSkillsMetaUserBody",
    "buildSkillsSection",
    "buildWorkflowActorIdentitySection",
    "countTokenEstimateUnits",
    "createContextBuilder",
    "estimateTokens",
    "tokenEstimatePrefixLength",
  ];
  assert.deepEqual(Object.keys(context).sort(), expected);
  for (const name of expected) {
    const kind = name === "ContextBuilder" ? "function" : "function";
    assert.equal(typeof context[name], kind, `${name} 形态不符`);
  }
  assert.equal(typeof context.createContextBuilder, "function");
});
