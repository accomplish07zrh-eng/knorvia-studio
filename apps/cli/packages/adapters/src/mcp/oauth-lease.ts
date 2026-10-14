// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE } from "@knorvia/shared";
import { acquireFileLock } from "@knorvia/shared/node";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import { isRecord, mcpOAuthCredentialKey } from "./oauth-credentials.js";

const RETRY_DELAYS_MS = [25] as const;
const OWNERLESS_GRACE_MS = 100;
const MAX_WAIT_MS = 250;
const ATTEMPT_BYTES = 16;
const PENDING_KEY = "pending_authorization";

interface McpOAuthAuthorizationLease {
  // 租约：同一时刻只允许一个交互式授权流程。
  attemptId: string; // 本次授权尝试的标识（租约与待授权记录共用）。
  release(): Promise<void>;
}

interface PendingAuthorizationRecord {
  // 落盘的待授权记录：重启后仍能续上同一次授权。
  attemptId: string; // 本次授权尝试的标识（租约与待授权记录共用）。
  authorizationUrl: string; // 用户在浏览器里打开的授权地址。
  baselineGeneration?: string; // 发起前的凭据代次，用于判断期间是否已被授权。
  expiresAt: number; // 待授权记录的过期时刻（毫秒）。
  state: string; // OAuth state，回调时校验。
}

export function sanitizeKeyPrefix(keyPrefix: string): string {
  // 键前缀只保留文件名安全字符，避免路径穿越。
  return keyPrefix.replace(/[^A-Za-z0-9-]/g, "-");
}

export async function tryAcquireAuthorizationLease(input: {
  credentialsFilePath: string; // 凭据文件路径。
  keyPrefix: string; // 凭据键前缀。
}): Promise<McpOAuthAuthorizationLease | undefined> {
  const lockPath = join(
    dirname(input.credentialsFilePath),
    `${sanitizeKeyPrefix(input.keyPrefix)}.authz`,
  );
  try {
    const release = await acquireFileLock(
      lockPath,
      RETRY_DELAYS_MS,
      OWNERLESS_GRACE_MS,
      MAX_WAIT_MS,
    );
    return { attemptId: randomBytes(ATTEMPT_BYTES).toString("hex"), release };
  } catch (error) {
    // 随机生成失败沿用同一分类边界；此适配层不额外调用已经取得的 release。
    if (typeof error === "object" && error !== null && "code" in error) {
      // 重复读取 getter 会改变分类或覆盖首因；类型判断与比较共享这一次读取。
      const code = error.code;
      if (typeof code === "string" && code === KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE) {
        return undefined;
      }
    }
    throw error;
  }
}

export async function publishPendingAuthorization(
  credentialStore: SharedKnorviaCredentialStore,
  keyPrefix: string,
  record: PendingAuthorizationRecord,
): Promise<void> {
  const pending = {
    attempt_id: record.attemptId,
    authorization_url: record.authorizationUrl,
    ...(record.baselineGeneration !== undefined
      ? { baseline_generation: record.baselineGeneration }
      : {}),
    expires_at: record.expiresAt,
    state: record.state,
  };
  // 投影完成后才解析 save，再依次计算 key 与 JSON，保留首个失败及原接收者。
  await credentialStore.save(
    mcpOAuthCredentialKey(keyPrefix, PENDING_KEY),
    JSON.stringify(pending),
  );
}

export async function loadPendingAuthorization(
  credentialStore: SharedKnorviaCredentialStore,
  keyPrefix: string,
  now = Date.now(),
): Promise<PendingAuthorizationRecord | undefined> {
  const raw = await credentialStore.load(mcpOAuthCredentialKey(keyPrefix, PENDING_KEY));
  if (!raw) return undefined; // 文件不存在或为空：没有待授权记录。
  let pending: unknown;
  try {
    pending = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (
    !isRecord(pending) ||
    typeof pending.attempt_id !== "string" ||
    typeof pending.authorization_url !== "string" ||
    typeof pending.state !== "string" ||
    typeof pending.expires_at !== "number" ||
    pending.expires_at <= now
  ) {
    return undefined;
  }
  return {
    attemptId: pending.attempt_id,
    authorizationUrl: pending.authorization_url,
    ...(typeof pending.baseline_generation === "string"
      ? { baselineGeneration: pending.baseline_generation }
      : {}),
    expiresAt: pending.expires_at,
    state: pending.state,
  };
}

export async function deletePendingAuthorizationIfOwned(
  credentialStore: SharedKnorviaCredentialStore,
  keyPrefix: string,
  attemptId: string,
): Promise<boolean> {
  const key = mcpOAuthCredentialKey(keyPrefix, PENDING_KEY);
  const raw = await credentialStore.load(key);
  if (!raw) return false;

  let pending: unknown;
  let malformed = false;
  try {
    pending = JSON.parse(raw);
  } catch {
    malformed = true;
  }
  if (!malformed && (!isRecord(pending) || pending.attempt_id !== attemptId)) return false;
  return await credentialStore.deleteIfValue(key, raw);
}
