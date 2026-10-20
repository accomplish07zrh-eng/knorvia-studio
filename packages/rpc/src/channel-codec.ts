// SPDX-License-Identifier: Apache-2.0
// 帧编解码：把「头部 + 载荷」变成一段 VSBuffer，或反过来解出两者。
//
// 抽成独立模块的理由：channel 的客户端与服务端都要收发帧，但两边的**状态机完全不同**。
// 把编解码留在一个地方，可以让两侧都只关心「哪条请求该被结算」，
// 也让帧格式的改动集中在一个文件里。
import { VSBuffer } from "./buffer.js";
import { BufferReader, BufferWriter, deserialize, serialize } from "./serialization.js";

/** 把头部数组与载荷编码成一帧；载荷为 `undefined` 时只写头部。 */
export function encodeFrame(header: readonly unknown[], payload: any): VSBuffer {
  const writer = new BufferWriter();
  serialize(writer, header);
  serialize(writer, payload);
  return writer.buffer;
}

/** 解出 [头部数组, 载荷] 二元组。 */
export function decodeFrame(buffer: VSBuffer): { header: any[]; payload: any } {
  const reader = new BufferReader(buffer);
  const header = deserialize(reader);
  const payload = deserialize(reader);
  return { header, payload };
}
