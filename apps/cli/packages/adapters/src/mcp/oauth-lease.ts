// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 交互式授权的「租约」与「待授权记录」。
//
// 租约用于保证同一时刻只有一个进程在跑交互式授权流程：抢到锁的一方成为主导方，
// 抢不到的一方转入跟随模式（见 oauth-interactive.ts）。
//
// 待授权记录落盘，让「浏览器已打开、等待回调」这件事在重启后仍能续上。
//
// ⚠️ 三处隐式契约（改动本文件时必须守住，都有测试断言）：
//   1. **字段插入顺序**：`loadPendingAuthorization` 返回对象的 `Object.keys` 顺序被断言为
//      `attemptId → authorizationUrl → [baselineGeneration] → expiresAt → state`，
//      所以 baselineGeneration 必须在 expiresAt **之前**插入，不能构造完再补。
//   2. **过期判定用否定式**：`expires_at <= now` → 无效。绝不能改写成 `expires_at > now`，
//      因为 `now` 可能是 NaN —— 两个写法在 NaN 下都为 false，但语义相反（前者「不判过期」）。
//   3. **求值顺序**：publish 必须「投影 → 取 save → 算 key → 序列化 → 调用」，
//      测试用 getter 追踪这个序列；把投影内联进 save(...) 参数会让 save 的 getter 先被访问。

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

/** 租约：同一时刻只允许一个交互式授权流程。 */
type McpOAuthAuthorizationLease = {
  /** 本次授权尝试的标识（租约与待授权记录共用）。 */
  attemptId: string;
  /** 归还锁。 */
  release: () => Promise<void>;
};

/** 待授权记录的归属与时效（参与判定）。 */
type PendingOwnership = {
  attemptId: string;
  expiresAt: number;
  state: string;
};

/** 待授权记录的展示信息与会话线索（不参与判定，只带着走）。 */
type PendingPresentation = {
  authorizationUrl: string;
  baselineGeneration?: string;
};

/** 落盘的待授权记录：重启后仍能续上同一次授权。 */
type PendingAuthorizationRecord = PendingOwnership & PendingPresentation;

/**
 * 落盘字段名的对照表。
 *
 * 落盘用 snake_case、内存用 camelCase —— 写成表之后，「哪两个名字是同一件事」一目了然，
 * 也避免读写两个方向各写一份散落的字面量。
 */
const PENDING_FIELDS = {
  attemptId: "attempt_id",
  authorizationUrl: "authorization_url",
  baselineGeneration: "baseline_generation",
  expiresAt: "expires_at",
  state: "state",
} as const;

/** 凭据键前缀：定位租约文件与待授权记录。 */
type KeyPrefix = string;

/** 凭据存储的短别名：四个导出函数都带它。 */
type CredentialStore = SharedKnorviaCredentialStore;

export function sanitizeKeyPrefix(keyPrefix: string): string {
  // 键前缀只保留文件名安全字符，避免路径穿越。
  return keyPrefix.replace(/[^A-Za-z0-9-]/g, "-");
}

/** 抢租约的入参。 */
type LeaseAsk = { credentialsFilePath: string; keyPrefix: string };

/**
 * 判断错误是否表示「锁超时」。
 *
 * 超时是正常结果（别人正在授权），不是失败。只读一次 `code`：
 * 重复读取 getter 会改变分类或覆盖首因。
 */
function isLockTimeout(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (!("code" in error)) return false;
  const code = (error as { code: unknown }).code;
  return typeof code === "string" && code === KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE;
}

export async function tryAcquireAuthorizationLease(
  input: LeaseAsk,
): Promise<McpOAuthAuthorizationLease | undefined> {
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
    // 抢不到就是「没有租约」，交由调用方转跟随模式。
    if (isLockTimeout(error)) return undefined;
    throw error;
  }
}

/** 解析 JSON：失败返回 undefined（调用方自行决定 undefined 的含义）。 */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * 把内存记录投影成落盘形态。
 *
 * ⚠️ `baselineGeneration` **读两次**（先判 undefined、再取值写入）是刻意的：
 * 测试断言了 getter 的精确调用序列。
 */
function toStoredRecord(record: PendingAuthorizationRecord): Record<string, unknown> {
  const stored: Record<string, unknown> = {};

  stored[PENDING_FIELDS.attemptId] = record.attemptId;
  stored[PENDING_FIELDS.authorizationUrl] = record.authorizationUrl;

  const baseline = record.baselineGeneration;
  if (baseline !== undefined) {
    stored[PENDING_FIELDS.baselineGeneration] = record.baselineGeneration;
  }

  stored[PENDING_FIELDS.expiresAt] = record.expiresAt;
  stored[PENDING_FIELDS.state] = record.state;
  return stored;
}

export async function publishPendingAuthorization(
  store: CredentialStore,
  prefix: KeyPrefix,
  record: PendingAuthorizationRecord,
): Promise<void> {
  // 求值顺序是契约：投影 → 取 save → 算 key → 序列化 → 调用。
  // 四步各自落一次局部变量；内联在 save(...) 参数里会让 save 的 getter 先被访问。
  const stored = toStoredRecord(record);
  const save = store.save;
  const key = mcpOAuthCredentialKey(prefix, PENDING_KEY);
  const serialized = JSON.stringify(stored);
  await save.call(store, key, serialized);
}

/**
 * 判断落盘记录是否结构完整且未过期。
 *
 * ⚠️ 过期判定保持否定式 `expires_at <= now`：测试会用 `now = NaN` 验证「clock 是普通数字比较」，
 * 此时两种写法的布尔值相同但语义相反 —— 原式表示「不判过期」，改写会误判为过期。
 */
function isUsablePending(candidate: unknown, now: number): candidate is Record<string, unknown> {
  if (!isRecord(candidate)) return false;

  const {
    attempt_id: attemptId,
    authorization_url: authorizationUrl,
    state,
    expires_at: expiresAt,
  } = candidate;
  if (typeof attemptId !== "string") return false;
  if (typeof authorizationUrl !== "string") return false;
  if (typeof state !== "string") return false;
  if (typeof expiresAt !== "number") return false;
  return !(expiresAt <= now);
}

/**
 * 把落盘形态还原成内存记录。
 *
 * ⚠️ 字段插入顺序是契约：`baselineGeneration` 必须插在 `expiresAt` 之前。
 */
function fromStoredRecord(stored: Record<string, unknown>): PendingAuthorizationRecord {
  const record = {} as PendingAuthorizationRecord;
  record.attemptId = stored[PENDING_FIELDS.attemptId] as string;
  record.authorizationUrl = stored[PENDING_FIELDS.authorizationUrl] as string;
  if (typeof stored[PENDING_FIELDS.baselineGeneration] === "string") {
    record.baselineGeneration = stored[PENDING_FIELDS.baselineGeneration] as string;
  }
  record.expiresAt = stored[PENDING_FIELDS.expiresAt] as number;
  record.state = stored[PENDING_FIELDS.state] as string;
  return record;
}

export async function loadPendingAuthorization(
  store: CredentialStore,
  prefix: KeyPrefix,
  now = Date.now(),
): Promise<PendingAuthorizationRecord | undefined> {
  const raw = await store.load(mcpOAuthCredentialKey(prefix, PENDING_KEY));
  if (!raw) return undefined;

  const parsed = parseJson(raw);
  if (!isUsablePending(parsed, now)) return undefined;
  return fromStoredRecord(parsed);
}

export async function deletePendingAuthorizationIfOwned(
  store: CredentialStore,
  prefix: KeyPrefix,
  attemptId: string,
): Promise<boolean> {
  const key = mcpOAuthCredentialKey(prefix, PENDING_KEY);
  const raw = await store.load(key);
  if (!raw) return false;

  // 解析失败不能当成「不是我的」——归属不明时仍按 owned 继续删。
  const parsed = parseJson(raw);
  if (parsed !== undefined && (!isRecord(parsed) || parsed.attempt_id !== attemptId)) return false;
  return await store.deleteIfValue(key, raw);
}
