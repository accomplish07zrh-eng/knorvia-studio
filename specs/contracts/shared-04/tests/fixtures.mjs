// SPDX-License-Identifier: Apache-2.0
// shared-04 金样读取与输入还原：fixtures 由旧实现录制，测试只读。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtureUrl = (name) => new URL(`../fixtures/${name}`, import.meta.url);

export const readFixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(fixtureUrl(name)), "utf8"));

/** 探针输入里的错误/文本/对象包装还原成真实调用参数。 */
export const rehydrate = (input) => {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
  if (input.type === "text") return input.value;
  if (input.type === "error") return new Error(input.message);
  if (input.type === "object") return input.value;
  return input;
};

/** 与 JSON 金样比较前去掉 undefined 属性（JSON 不保留 undefined 键）。 */
export const jsonValue = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export const assertJsonEqual = (actual, expected, message) =>
  assert.deepEqual(jsonValue(actual), expected, message);
