// SPDX-License-Identifier: Apache-2.0
// 状态事件的请求/响应头投影：凭据类头替换为固定掩码，非字符串值直接丢弃。
// 掩码文本与事件消费者的既有约定一致，属于对外可见文案，不得改写。

const CREDENTIAL_HEADER =
  /^(authorization|proxy-authorization|x-api-key|api-key|cookie|set-cookie)$/i;
const CREDENTIAL_MASK = "[REDACTED]";

export function sanitizeModelNetworkHeaders(value: unknown): Record<string, string> {
  const projected: Record<string, string> = {};
  if (typeof value !== "object" || value === null) return projected;
  for (const name of Object.keys(value)) {
    const entry = (value as Record<string, unknown>)[name];
    if (typeof entry !== "string") continue;
    projected[name] = CREDENTIAL_HEADER.test(name) ? CREDENTIAL_MASK : entry;
  }
  return projected;
}
