// SPDX-License-Identifier: Apache-2.0
// steering 输入的度量与预览（B18 纯函数部分）。
// 三个口径都是契约：字节数按 UTF-8 编码计算；预览把连续空白压成单空格、去首尾空白，
// 超过 200 字符截断并追加 `...`；「最近真实用户消息」返回从尾部数的偏移（没有则 undefined）。
// 全部同步纯计算：不抛异常、不修改入参。
import type { ModelInputMessage } from "../../deps.js";

// steering 单条输入的字节上限（协议常量，逐字冻结）。
export const MAX_TURN_STEER_INPUT_BYTES = 200_000; // 200 KB

// 预览截断长度与省略后缀（逐字冻结）。
const PREVIEW_LIMIT_CHARS = 200;
const PREVIEW_ELLIPSIS = "...";

// 按 UTF-8 编码算字节数：TextEncoder 与平台无关，同一字符串在三端同值。
export const measureUtf8Bytes = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

// 预览归一：连续空白（换行/制表符在内）压成单空格，首尾空白去掉，超长只留前 200 字符。
export const previewInput = (raw: string): string => {
  const flattened = raw.replace(/\s+/g, " ").trim();
  if (flattened.length <= PREVIEW_LIMIT_CHARS) return flattened;
  return flattened.slice(0, PREVIEW_LIMIT_CHARS) + PREVIEW_ELLIPSIS;
};

// 从尾部找最近真实用户消息，返回从尾部数的偏移；整段历史没有用户消息则 undefined。
export const findLatestUserMessageFromEnd = (history: ModelInputMessage[]): number | undefined => {
  const hitIndex = history.findLastIndex((entry) => entry.role === "user");
  return hitIndex === -1 ? undefined : history.length - 1 - hitIndex;
};
