// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 声明模式只豁免合同列名的纯数据常量表；夹带函数、条件、计算的 const 照常计分。
import assert from "node:assert/strict";
import { test } from "node:test";
import { isPureDataConst, stripDeclarationBlocks } from "./similarity-declarations.mjs";

const pure = [
  'export const A = [\n  "a",\n  "b",\n] as const;',
  'const B: readonly string[] = ["x", "y"];',
  'export const C = z.enum(["a", "b"]);',
  "const D = Object.freeze({ a: 1, b: -2, c: null, d: true });",
  'const E = { "a-b": "x-y", n: 3 };',
];

const impure = [
  "const F = { a: () => 1 };",
  "const G = { a: x ? 1 : 2 };",
  "const H = [1 + 2];",
  'const I = foo(["a"]);',
  'const J = "a b".split(" ");',
  "const K = z.string().min(1);",
  'const L = [...OTHER, "c"];',
  "const M = { a: function () { return 1; } };",
  "const N = `${PREFIX}-x`;",
  "const O = LIMIT - 1;",
];

test("纯数据常量表判为纯数据", () => {
  for (const block of pure) assert.equal(isPureDataConst(block), true, block);
});

test("夹带函数、条件、计算或调用的 const 不算纯数据", () => {
  for (const block of impure) assert.equal(isPureDataConst(block), false, block);
});

test("列名的纯数据 const 整块剔除，夹带计算的列名 const 原样保留计分", () => {
  const text = [
    'export const NAMES = ["a", "b"] as const;',
    "export const RULES = { max: LIMIT * 2 };",
    "export function use() { return NAMES; }",
  ].join("\n");
  const { text: kept, strippedBlocks } = stripDeclarationBlocks(text, ["NAMES", "RULES"]);
  assert.equal(strippedBlocks, 1);
  assert.match(kept, /RULES = \{ max: LIMIT \* 2 \}/u);
  assert.doesNotMatch(kept, /NAMES = \[/u);
});
