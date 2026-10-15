// SPDX-License-Identifier: Apache-2.0
// data URL 的头部解析与 base64 载荷校验（B3）。
// 本模块只做纯字符串计算，不触碰任何外部端口：scheme 判定大小写不敏感，媒体类型取逗号前
// 首个分段并统一小写化；载荷的严格校验要求「长度为 4 的倍数、内容段全部落在 base64 字符
// 集、填充符只允许出现在尾部」，供 PDF/视频/图片解析在解码前共用。

// base64 每 4 个字符一组，一组承载 3 字节。
const CHARS_PER_GROUP = 4;
const BYTE_WEIGHT_PER_CHAR = 3;

const SCHEME = "data:";
// 内容段字符集：字母数字与 `+` `/`；`=` 不允许出现在内容段里。
const BODY_PATTERN = /^[A-Za-z0-9+/]+$/u;
// 尾部填充最多两个 `=`，按「从后向前最多两个」计数，与严格校验共用同一口径。
const TRAILING_PADDING_PATTERN = /={1,2}$/u;

// 解析 data URL 头：返回小写化的媒体类型，丢弃参数段。
// scheme 不匹配、缺逗号或媒体类型为空都返回 undefined，不抛异常。
export function parseDataUrlHeader(dataUrl: string): { mediaType: string } | undefined {
  const schemeMatches = dataUrl.slice(0, SCHEME.length).toLowerCase() === SCHEME;
  const payloadStart = dataUrl.indexOf(",");
  if (!schemeMatches || payloadStart < 0) {
    // 缺 scheme 或缺逗号：调用方按「不是 data URL」降级。
    return undefined;
  }
  const declaredType = dataUrl.slice(SCHEME.length, payloadStart).split(";")[0]?.trim();
  return declaredType ? { mediaType: declaredType.toLowerCase() } : undefined;
}

// 估算 base64 载荷的解码字节数：先按「每字符 3/4 字节」折算，再扣掉尾部填充占位。
// 本函数不做合法性校验，非法载荷的估算结果仅供上层做体积判断。
export function base64PayloadByteLength(payload: string): number {
  const grossBytes = Math.floor((payload.length * BYTE_WEIGHT_PER_CHAR) / CHARS_PER_GROUP);
  return grossBytes - trailingPaddingChars(payload);
}

// 判定载荷是否为「严格 base64」：空载荷视为合法；长度必须能被 4 整除；内容段只能由
// 字母数字与 `+` `/` 组成；`=` 只能作为尾部填充出现。
export function isStrictBase64Payload(payload: string): boolean {
  if (payload.length === 0) {
    return true;
  }
  if (payload.length % CHARS_PER_GROUP !== 0) {
    return false;
  }
  const body = payload.slice(0, payload.length - trailingPaddingChars(payload));
  return body.length > 0 && BODY_PATTERN.test(body);
}

// 计算尾部填充长度：最多认两个 `=`；混进内容段的 `=` 不算填充，由字符集校验拒绝。
function trailingPaddingChars(payload: string): number {
  return payload.length - payload.replace(TRAILING_PADDING_PATTERN, "").length;
}
