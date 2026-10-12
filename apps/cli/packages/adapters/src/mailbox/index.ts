// SPDX-License-Identifier: Apache-2.0
// 会话信箱：unread 目录投递、drain 时按文件名顺序搬进 read 目录。
import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { SessionId, SessionMailboxEnvelope, SessionMailboxPort } from "@knorvia/contracts";

export interface NodeSessionMailboxOptions {
  rootDir: string;
}

const SESSION_ID_PATTERN = /^sess_[A-Za-z0-9._-]+$/;
const ENVELOPE_VERSION = 1;
const ENVELOPE_EXTENSION = ".json";
const DEFAULT_DRAIN_LIMIT = 20;
/** 信封里必须是字符串的字段（version 单独判定）。 */
const ENVELOPE_TEXT_FIELDS = [
  "messageId",
  "fromSessionId",
  "toSessionId",
  "content",
  "createdAt",
] as const;

type Box = "read" | "unread";

function normalizeSessionId(sessionId: SessionId): string {
  const canonical = String(sessionId);
  if (!SESSION_ID_PATTERN.test(canonical)) {
    throw new Error(`Invalid session id: ${canonical}`);
  }
  return canonical;
}

/** 目录必须落在 root 之内：resolve 后做相对路径检查，拒绝绝对路径与 `..`。 */
function assertWithinBase(rootDir: string, sessionDir: string, sessionId: string): string {
  const relativePath = relative(rootDir, sessionDir);
  const escapes = !relativePath || relativePath.startsWith("..") || isAbsolute(relativePath);
  if (escapes) throw new Error(`Session mailbox path escapes root: ${sessionId}`);
  return sessionDir;
}

function looksLikeEnvelope(value: unknown): value is SessionMailboxEnvelope {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.version !== ENVELOPE_VERSION) return false;
  return ENVELOPE_TEXT_FIELDS.every((field) => typeof record[field] === "string");
}

function decodeEnvelope(raw: string): SessionMailboxEnvelope {
  const decoded: unknown = JSON.parse(raw);
  if (!looksLikeEnvelope(decoded)) throw new Error("Invalid session mailbox envelope");
  return decoded;
}

/** 待读条目：只取 .json，按文件名升序（即投递顺序），受 limit 约束。 */
async function listUnread(pendingDir: string, limit: number | undefined): Promise<string[]> {
  const found = await readdir(pendingDir);
  const ordered = found.filter((name) => name.endsWith(ENVELOPE_EXTENSION)).sort();
  return ordered.slice(0, limit ?? DEFAULT_DRAIN_LIMIT);
}

/** 两个信箱目录都要存在：投递方与读取方各自可能先到。 */
async function ensureDirectories(pendingDir: string, archivedDir: string): Promise<void> {
  await mkdir(pendingDir, { recursive: true });
  await mkdir(archivedDir, { recursive: true });
}

/**
 * 会话信箱 adapter：
 * - 投递方把信封写进 `<root>/<sessionId>/unread/*.json`；
 * - drain 按文件名升序读取并把文件搬进 `read/`，因此重复调用不会重复返回同一条；
 * - sessionId 与最终目录都做校验，任何越界路径直接抛错而不落到文件系统。
 */
export class NodeSessionMailboxAdapter implements SessionMailboxPort {
  constructor(private readonly settings: NodeSessionMailboxOptions) {}

  async drainUnread(
    query: { sessionId: SessionId; limit?: number },
    options?: { signal?: AbortSignal },
  ): Promise<SessionMailboxEnvelope[]> {
    const pendingDir = this.sessionDir(query.sessionId, "unread");
    const archivedDir = this.sessionDir(query.sessionId, "read");
    await ensureDirectories(pendingDir, archivedDir);

    const collected: SessionMailboxEnvelope[] = [];
    for (const name of await listUnread(pendingDir, query.limit)) {
      options?.signal?.throwIfAborted();
      const fromPath = join(pendingDir, name);
      const toPath = join(archivedDir, name);
      collected.push(decodeEnvelope(await readFile(fromPath, "utf8")));
      await rename(fromPath, toPath);
    }
    return collected;
  }

  /** 取某个信箱目录：先校验 sessionId，再确认最终路径仍在 root 之内。 */
  private sessionDir(sessionId: SessionId, box: Box): string {
    const canonical = normalizeSessionId(sessionId);
    const rootDir = resolve(this.settings.rootDir);
    const target = resolve(rootDir, canonical, box);
    return assertWithinBase(rootDir, target, canonical);
  }
}

export function createNodeSessionMailboxAdapter(
  options: NodeSessionMailboxOptions,
): SessionMailboxPort {
  return new NodeSessionMailboxAdapter(options);
}
