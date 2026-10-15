// SPDX-License-Identifier: Apache-2.0
// 选项映射请求体改写：provider 请求体（JSON 文本）发出前按编译好的选项映射补丁改写，
// 并把改写结果留档给调试记录。三处错误文案是对外可见字符串，保持逐字。

import type {
  CompiledModelOptionMaps,
  JsonObject,
  ModelOptionValues,
} from "@knorvia/model-option-map";

type WireFetch = typeof globalThis.fetch;

const BODY_NOT_OBJECT = "Model option maps require a JSON object request body";
const BODY_NOT_JSON = "Model option maps require valid JSON";

export interface RawRequestBodyCapture {
  body?: JsonObject;
}

function parseWireObject(raw: string): JsonObject {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (cause) {
    // 解析失败保留原始异常为 cause：调用方按 TypeError 文案分类，原始栈用于诊断。
    throw new TypeError(BODY_NOT_JSON, { cause });
  }
  const plainObject = typeof decoded === "object" && decoded !== null && !Array.isArray(decoded);
  if (!plainObject) throw new TypeError(BODY_NOT_OBJECT);
  return decoded as JsonObject;
}

interface WrapperInput {
  /** 调试记录的请求体留档出口；缺省表示不捕获。 */
  readonly capture?: RawRequestBodyCapture;
  readonly fetch: WireFetch;
  /** Model 创建时编译一次的选项映射程序。 */
  readonly maps: CompiledModelOptionMaps;
  /** 本轮冻结的选项取值（reasoningLevel 与 maxOutputTokens）。 */
  readonly values: ModelOptionValues;
}

export function createModelOptionMapFetch(input: WrapperInput): WireFetch {
  return async (wireResource, wireInit) => {
    const wireBody = wireInit?.body;
    if (wireBody === undefined) return input.fetch(wireResource, wireInit);
    if (typeof wireBody !== "string") throw new TypeError(BODY_NOT_OBJECT);
    const rewritten = input.maps.apply(parseWireObject(wireBody), input.values);
    if (input.capture) input.capture.body = rewritten;
    return input.fetch(wireResource, { ...wireInit, body: JSON.stringify(rewritten) });
  };
}
