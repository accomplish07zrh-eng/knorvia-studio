// SPDX-License-Identifier: Apache-2.0
// 帧与响应之间的双向转换。
//
// 本模块是 channel 层唯一知道「一段字节如何对应一条响应」的地方；协议常量的
// 形状声明在 channel-protocol-declaration.ts（纯数据，声明模式计分），
// 这里只处理**转换**——即必须有逻辑的那部分。
//
// 转换用「分段 + 跳转表」而不是逐条件分支：
//   编码：头部一段 → 载荷一段 → 拼一帧；
//   解码：拆一段 → 拆二段 → 交给归一；
//   归一：按种类查表得到记录构造器，未知种类返回 `null`（向前兼容）。
import { VSBuffer } from "./buffer.js";
import { BufferReader, BufferWriter, deserialize, serialize } from "./serialization.js";
import { ResponseType } from "./channel-wire.js";
import type { IRawErrorData, IRawResponse } from "./channel-protocol-declaration.js";

/**
 * 响应种类的记录构造表。
 *
 * 每项接收 `(id, payload)` 并给出对应的判别记录；`Initialize` 例外（不带 id），
 * 由 `toResponse` 单独短路处理，因此不在表里。
 * 用表而非 switch：新增种类只需加一行，也不会退化成逐分支重复形状。
 */
const RECORD_BUILDERS: Readonly<Record<number, (id: number, payload: unknown) => IRawResponse>> = {
  [ResponseType.PromiseSuccess]: (id, payload) => ({
    type: ResponseType.PromiseSuccess,
    id,
    data: payload,
  }),
  [ResponseType.PromiseError]: (id, payload) => ({
    type: ResponseType.PromiseError,
    id,
    data: payload as IRawErrorData,
  }),
  [ResponseType.PromiseErrorObj]: (id, payload) => ({
    type: ResponseType.PromiseErrorObj,
    id,
    data: payload,
  }),
  [ResponseType.EventFire]: (id, payload) => ({
    type: ResponseType.EventFire,
    id,
    data: payload,
  }),
};

/** 编码：把头部与载荷分成两段写入，再拼成一段。 */
export function encodeFrame(header: readonly unknown[], payload: any): VSBuffer {
  const parts: VSBuffer[] = [];
  const headerWriter = new BufferWriter();
  serialize(headerWriter, header);
  parts.push(headerWriter.buffer);

  const payloadWriter = new BufferWriter();
  serialize(payloadWriter, payload);
  parts.push(payloadWriter.buffer);

  return VSBuffer.concat(parts);
}

/** 解码：按「先头部、后载荷」的顺序各读一段。 */
export function decodeFrame(buffer: VSBuffer): { header: any[]; payload: any } {
  const reader = new BufferReader(buffer);
  const header = deserialize(reader);
  const payload = deserialize(reader);
  return { header, payload };
}

/**
 * 归一：把解码结果变成响应记录。
 *
 * 三种「不是响应」的情形都返回 `null` 而不是抛错——向前兼容要求
 * 「看不懂的帧跳过」，让连接继续可用：
 *   · 头部不是非空数组；
 *   · 种类未知；
 *   · 非 Initialize 但缺少数值 id。
 */
export function toResponse(header: any[], payload: any): IRawResponse | null {
  if (!Array.isArray(header) || header.length === 0) {
    return null;
  }
  const [kind, id] = header as [unknown, unknown];
  // Initialize 是全局就绪信号，不带 id，必须早于 id 校验处理。
  if (kind === ResponseType.Initialize) {
    return { type: ResponseType.Initialize };
  }
  if (typeof id !== "number") {
    return null;
  }
  const build = RECORD_BUILDERS[kind as number];
  return build === undefined ? null : build(id, payload);
}
