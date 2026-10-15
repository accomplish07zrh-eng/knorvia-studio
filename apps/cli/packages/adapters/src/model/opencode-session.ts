// SPDX-License-Identifier: Apache-2.0
// OpenCode Go 网关地址判定：请求装配据此决定是否携带会话头。
// 只识别一种网关形态（origin 固定、路径带版本段），其余一律视为普通端点。

const GATE_ORIGIN = "https://opencode.ai";
const GATE_PATH_PATTERN = /^\/zen\/go\/v1\/?$/u;

function parseEndpoint(raw: string): URL | undefined {
  if (!URL.canParse(raw)) return undefined;
  return new URL(raw);
}

export function isOpenCodeGoBaseUrl(baseURL: string | undefined): boolean {
  if (typeof baseURL !== "string" || baseURL.length === 0) return false;
  const endpoint = parseEndpoint(baseURL);
  return (
    endpoint !== undefined &&
    endpoint.origin === GATE_ORIGIN &&
    GATE_PATH_PATTERN.test(endpoint.pathname)
  );
}
