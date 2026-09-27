// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolInputValidationIssue as Issue } from "../tool-input-validation-issues.js";
import { record } from "./identity.js";

type Role = "issues" | "branches" | "issue";
type Value = { kind: "value"; value: unknown; depth: number; role: Role; key: string };
type ObjectFrame = { value: Record<string, unknown>; depth: number; emitted: number };
type Work =
  | string
  | Value
  | { kind: "element"; array: unknown[]; index: number; depth: number; role: Role }
  | { kind: "leave"; value: object }
  | { kind: "field"; key: string; frame: ObjectFrame }
  | { kind: "close"; frame: ObjectFrame };
const INDENT_WIDTH = 2;
const indent = (depth: number) => " ".repeat(depth * INDENT_WIDTH);
const hasHook = (value: object) => "toJSON" in value && typeof value.toJSON === "function";
const shifted = (text: string, depth: number) => text.replace(/\n/g, `\n${indent(depth)}`);

function native(value: unknown, key: string): string | undefined {
  // 受控外层返回单字段容器，保留父键且不把名为 toJSON 的数据字段当作容器钩子。
  // 原生编码器不会再次转换 hook 返回的容器，也不会二次转换用户 hook 的返回对象。
  const encoded = JSON.stringify(
    { toJSON: () => ({ [key]: value }) },
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    INDENT_WIDTH,
  );
  if (encoded === "{}") return undefined;
  const prefix = `{\n${indent(1)}${JSON.stringify(key)}: `;
  return encoded.slice(prefix.length, -2).replace(/\n {2}/g, "\n");
}

export function issueJson(issues: readonly Issue[]): string {
  const chunks: string[] = [];
  const pending: Work[] = [{ kind: "value", value: issues, depth: 0, role: "issues", key: "" }];
  const active = new Set<object>();
  const enter = (value: object) => {
    if (active.has(value)) throw new TypeError("Validation issue JSON contains a cycle");
    active.add(value);
    pending.push({ kind: "leave", value });
  };

  // 深层 union 在原生 stringify 中耗尽调用栈；只展开标准错误树，其余载荷仍由原生编码。
  while (pending.length) {
    const work = pending.pop()!;
    if (typeof work === "string") {
      chunks.push(work);
      continue;
    }
    if (work.kind === "leave") {
      active.delete(work.value);
      continue;
    }
    if (work.kind === "close") {
      chunks.push(work.frame.emitted ? `\n${indent(work.frame.depth)}}` : "}");
      continue;
    }
    if (work.kind === "element") {
      // 前一个元素的 toJSON 可能更新后一个元素，不能在建栈时提前读取所有数组值。
      pending.push({
        kind: "value",
        value: work.array[work.index],
        key: String(work.index),
        depth: work.depth,
        role: work.role,
      });
      continue;
    }
    if (work.kind === "field") {
      const { frame, key } = work;
      const value = frame.value[key];
      const branches = key === "errors" && Array.isArray(value) && !hasHook(value);
      const encoded = branches ? undefined : native(value, key);
      if (!branches && encoded === undefined) continue;
      chunks.push(
        `${frame.emitted++ ? "," : ""}\n${indent(frame.depth + 1)}${JSON.stringify(key)}: `,
      );
      if (branches)
        pending.push({ kind: "value", value, key, depth: frame.depth + 1, role: "branches" });
      else chunks.push(shifted(encoded!, frame.depth + 1));
      continue;
    }
    const { value, depth, role, key } = work;
    if ((role === "issues" || role === "branches") && Array.isArray(value) && !hasHook(value)) {
      enter(value);
      chunks.push("[");
      pending.push(value.length ? `\n${indent(depth)}]` : "]");
      for (let index = value.length - 1; index >= 0; index--) {
        pending.push({
          kind: "element",
          array: value,
          index,
          depth: depth + 1,
          role: role === "branches" ? "issues" : "issue",
        });
        pending.push(`${index ? "," : ""}\n${indent(depth + 1)}`);
      }
    } else if (
      role === "issue" &&
      record(value) &&
      value.code === "invalid_union" &&
      !hasHook(value)
    ) {
      enter(value);
      const frame: ObjectFrame = { value, depth, emitted: 0 };
      chunks.push("{");
      pending.push({ kind: "close", frame });
      const keys = Object.keys(value);
      for (let index = keys.length - 1; index >= 0; index--)
        pending.push({ kind: "field", key: keys[index], frame });
    } else {
      chunks.push(shifted(native(value, key) ?? "null", depth));
    }
  }
  return chunks.join("");
}
