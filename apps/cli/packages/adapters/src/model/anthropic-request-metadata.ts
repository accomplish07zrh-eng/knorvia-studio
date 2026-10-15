// SPDX-License-Identifier: Apache-2.0
// Anthropic 请求元数据：仅 anthropic 种类生成 user id（设备标识 + 空账号槽 + 会话 id），
// 其余 provider 不带；脱敏逐节点抹掉 user id 类键，媒体与凭据不进元数据。

import type { EnvRecord } from "./model-execution.js";
import type { ModelStatusContext } from "./runner-status.js";
import { ensureCliDeviceMid } from "../device/cli-device-mid.js";

const USER_ID_KEY = /^(user_?id)$/iu;
const REDACTED = "[REDACTED]";

export async function resolveAnthropicRequestMetadataUserId(request: {
  env: EnvRecord;
  providerKind: string | undefined;
  sessionId?: ModelStatusContext["sessionId"];
}): Promise<string | undefined> {
  if (request.providerKind !== "anthropic") return undefined;
  const deviceId = await ensureCliDeviceMid({ env: request.env });
  if (deviceId === undefined || deviceId === "") return undefined;
  const sessionKey = String(request.sessionId ?? "");
  return JSON.stringify({ device_id: deviceId, account_uuid: "", session_id: sessionKey });
}

function redactNode(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    const list: unknown[] = [];
    for (const entry of node) list.push(redactNode(entry));
    return list;
  }
  const masked: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    const entry = (node as Record<string, unknown>)[key];
    masked[key] = USER_ID_KEY.test(key) ? REDACTED : redactNode(entry);
  }
  return masked;
}

export function redactAnthropicRequestMetadata(payload: unknown): unknown {
  return redactNode(payload);
}
