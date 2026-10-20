// SPDX-License-Identifier: Apache-2.0
/* 官方 Server MCP 在 tool 调用被拦截 / 失败时下发的结构化标识。
 *
 * 服务端把它渲染成 **tool error content 的 JSON 文本**（不是 `_meta`）：
 * `{"error_code":"quota_exceeded","message":"...","request_id":"..."}`
 *
 * 放在 shared 是因为有三个分属不同包的消费者：
 * - `apps/cli/packages/core`：解析 MCP 结果，把 code 带进 tool result display；
 * - `packages/shared/src/protocol-v4/rows.ts`：row schema 校验该 code；
 * - `packages/ui`：按 code 决定输入框上方提示的文案与动作。
 * 三处必须同源，否则新增 code 时会出现一侧识别、另一侧丢弃。
 */

/**
 * 客户端会据此改变界面行为的 code。
 *
 * 服务端还有 `internal_error`，**故意不在这里**：它是"其它一切失败"的兜底掩码
 * （详情只留在服务端日志），用户无法自助解决，不该弹提示。
 */
const TOOL_ERROR_CODE_LIST = ["quota_exceeded", "coding_plan_required"] as const;

export const OFFICIAL_MCP_TOOL_ERROR_CODES = TOOL_ERROR_CODE_LIST;

export type OfficialMcpToolErrorCode = (typeof TOOL_ERROR_CODE_LIST)[number];

type McpErrorText = {
  /** 服务端给的英文可读文案；仅用于日志与排障，界面文案走 i18n。 */
  message?: string;
  /** 服务端 request id，便于与后端日志对账。 */
  requestId?: string;
};

export type OfficialMcpToolError = McpErrorText & {
  code: OfficialMcpToolErrorCode;
};

type RawToolErrorFields = {
  error_code?: unknown;
  message?: unknown;
  request_id?: unknown;
};

/** 空串与纯空白视作缺失；保留原始大小写，只裁首尾空白。 */
const textField = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmedValue = value.trim();
  return trimmedValue.length === 0 ? undefined : trimmedValue;
};

/** 以首字符预筛，避免把普通错误文本交给 JSON.parse。 */
const readJsonObject = (text: string): Record<string, unknown> | undefined => {
  const source = text.trim();
  if (source[0] !== "{") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return undefined;
  }
  const isRecord = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  return isRecord ? (parsed as Record<string, unknown>) : undefined;
};

const knownErrorCode = (value: unknown): OfficialMcpToolErrorCode | undefined => {
  const candidate = textField(value);
  if (candidate === undefined) return undefined;
  const matched = OFFICIAL_MCP_TOOL_ERROR_CODES.find((code) => code === candidate);
  return matched;
};

/**
 * 从 tool error 文本里解析结构化标识。
 *
 * 严格解析：必须是 JSON 对象且 `error_code` 命中已知 code，否则返回 undefined。
 * 不做文案匹配兜底——那会让服务端改一句话就静默失效。
 */
export const parseOfficialMcpToolError = (text: string): OfficialMcpToolError | undefined => {
  const payload = readJsonObject(text);
  if (payload === undefined) return undefined;

  const fields = payload as RawToolErrorFields;
  const code = knownErrorCode(fields.error_code);
  if (code === undefined) return undefined;

  const result: OfficialMcpToolError = { code };
  const message = textField(fields.message);
  if (message !== undefined) result.message = message;
  const requestId = textField(fields.request_id);
  if (requestId !== undefined) result.requestId = requestId;
  return result;
};
