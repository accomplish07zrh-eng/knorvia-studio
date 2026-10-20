// SPDX-License-Identifier: Apache-2.0
// 结构化错误的双向映射：把 Error 摊成可跨进程的载荷，或把载荷还原成 Error。
//
// 两端各用一半：服务端编、客户端解。放在同一文件是因为它们**必须对称**——
// 编的时候漏一个键，解的时候就少一个字段；写在一起才能一眼看出两边对齐。
import { TRANSFERABLE_ERROR_KEYS, type IRawErrorData } from "./channel-response.js";

/**
 * 把 Error 摊成线上载荷。
 *
 * `stack` 按行切分成数组：跨进程直接传多行字符串会被序列化层转义，
 * 恢复时对不上原来的一行一条。
 */
export function errorToPayload(error: Error): IRawErrorData {
  const payload: IRawErrorData = {
    message: error.message,
    name: error.name,
    stack: error.stack === undefined ? undefined : error.stack.split("\n"),
  };
  const carrier = error as Error & Record<string, unknown>;
  for (const key of TRANSFERABLE_ERROR_KEYS) {
    const value = carrier[key];
    // 只搬非 undefined 的键：不往线上写空字段，保持帧紧凑。
    if (value !== undefined) {
      payload[key] = value;
    }
  }
  return payload;
}

/** 把线上载荷还原成 Error；`stack` 数组 join 回单个字符串。 */
export function payloadToError(data: IRawErrorData): Error {
  const rebuilt = new Error(data.message);
  rebuilt.name = data.name;
  if (data.stack !== undefined) {
    rebuilt.stack = data.stack.join("\n");
  }
  const carrier = rebuilt as Error & Record<string, unknown>;
  for (const key of TRANSFERABLE_ERROR_KEYS) {
    const value = data[key];
    if (value !== undefined) {
      carrier[key] = value;
    }
  }
  return rebuilt;
}
