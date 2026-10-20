// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02 契约测试读「冻结面」的探针。
//
// 只读 `@knorvia/shared/protocol-v4` 的公开导出（该子路径是冻结协议面），
// 不 import bootstrap/core 的任何内部模块。
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { repoRoot } from "./entry.mjs";

/** 共享包 protocol-v4 子路径的源码入口；测试经 tsx 解析 TypeScript。 */
const SHARED_PROTOCOL_ENTRY = join(repoRoot, "packages/shared/src/protocol-v4/index.ts");

/**
 * 读 v4 命令面的全部字面量（`commandPayloadSchemas` 的键）。
 *
 * @returns 命令字面量清单。
 */
export async function loadCommandTypes() {
  const shared = await import(pathToFileURL(SHARED_PROTOCOL_ENTRY).href);
  const schemas = shared.commandPayloadSchemas;
  if (schemas === undefined) {
    throw new Error("@knorvia/shared/protocol-v4 未导出 commandPayloadSchemas");
  }
  return Object.keys(schemas);
}

/**
 * 读 `sendText` 的 payload schema（zod 对象），供断言字段存在性与取值合法性。
 *
 * @returns 该 schema。
 */
export async function loadSendTextSchema() {
  const shared = await import(pathToFileURL(SHARED_PROTOCOL_ENTRY).href);
  return shared.commandPayloadSchemas.sendText;
}

/**
 * 用 schema 的实际解析行为判定一个 `requestedDelivery` 取值是否合法。
 * 不依赖 zod 内部结构（`_def` 形状随版本变），只看「能不能解析」。
 *
 * @param value - 要试的取值。
 * @returns 解析是否通过。
 */
export async function acceptsRequestedDelivery(value) {
  const schema = await loadSendTextSchema();
  return schema.safeParse({ text: "probe", requestedDelivery: value }).success;
}

/**
 * 读 `V4_METHODS` 的取值集合（方法名字面量）。
 *
 * @returns 方法名清单。
 */
export async function loadV4Methods() {
  const shared = await import(pathToFileURL(SHARED_PROTOCOL_ENTRY).href);
  const methods = shared.V4_METHODS;
  if (methods === undefined) {
    throw new Error("@knorvia/shared/protocol-v4 未导出 V4_METHODS");
  }
  return Object.values(methods);
}
