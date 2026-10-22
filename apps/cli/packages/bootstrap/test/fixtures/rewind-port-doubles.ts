// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind 测试替身：`FileSystemPort` 与 `SessionEventStorePort` 的内存实现。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/acceptance.md §5（端口替身要求）
//
// **替身必须与端口契约一致**，否则「测试通过但真实实现失败」。
// 本文件逐条说明「覆盖哪些契约、不覆盖哪些」：
//
// FileSystemPort（覆盖本包用到的子集）：
//   ✅ stat（kind: "file" / "missing"）
//   ✅ readTextFile（content 已 LF 归一化 —— 与真实端口一致，见端口注释）
//   ✅ writeTextFile（createParents 语义：内存树自动建父级）
//   ✅ removeFile（missingOk 语义）
//   ❌ 不覆盖：readBinaryFile / readTextFileRange / listDirectory / searchFiles / searchText
//   ❌ 不覆盖：revision / mtime / 编码检测 / 平台路径规范化（真实实现负责）
//
// SessionEventStorePort（覆盖本包用到的子集）：
//   ✅ append（递增 sequenceNumber）
//   ✅ getEvents（按 sequenceNumber 升序 —— 端口契约要求「按会话追加的顺序可回放」）
//   ❌ 不覆盖：getEventsAfter / getLatestSequenceNumber / deleteSession / getStats

import { isFileSystemPortError, FileSystemPortError } from "@knorvia/contracts";

/** 端口错误的构造助手（与真实实现同样用 FileSystemPortError）。 */
function portError(code: string, message: string, path?: string): FileSystemPortError {
  return new FileSystemPortError({
    code: code as never,
    message,
    ...(path === undefined ? {} : { path }),
  });
}

/** `FileSystemPort` 的内存替身。 */
export class InMemoryFileSystem {
  private readonly files = new Map<string, string>();
  private writeAttempts = 0;
  private failWriteAt = 0;
  private statShouldThrow = false;

  /** 已发生的写入次数（断言「preview 零写入」用）。 */
  writeCount = 0;
  /** 已发生的删除次数。 */
  removeCount = 0;

  /** 预置一个文件。 */
  seed(path: string, content: string): void {
    this.files.set(path, content);
  }

  /** 读当前内容（`undefined` 表示不存在）。 */
  read(path: string): string | undefined {
    return this.files.get(path);
  }

  /** 让第 `attempt` 次写入抛错（从 1 开始计数），用于测补偿。 */
  failWriteOnAttempt(attempt: number): void {
    this.failWriteAt = attempt;
    this.writeAttempts = 0;
  }

  /** 让 `stat` 抛错（用于测「读不到当前状态」的 fail closed）。 */
  failStat(): void {
    this.statShouldThrow = true;
  }

  // ── FileSystemPort 接口 ──────────────────────────────────────────────────

  async stat(request: {
    path: string;
  }): Promise<{ path: string; kind: string; sizeBytes: number }> {
    if (this.statShouldThrow) {
      throw portError("io_error", "stat failed (fixture)", request.path);
    }
    const content = this.files.get(request.path);
    return content === undefined
      ? { path: request.path, kind: "missing", sizeBytes: 0 }
      : { path: request.path, kind: "file", sizeBytes: content.length };
  }

  async readTextFile(request: { path: string }): Promise<{ path: string; content: string }> {
    const content = this.files.get(request.path);
    if (content === undefined) {
      throw portError("not_found", `no such file: ${request.path}`, request.path);
    }
    // 端口契约：`content` 的换行已统一成 LF。替身也做同样归一化。
    return { path: request.path, content: content.replace(/\r\n/gu, "\n") };
  }

  async writeTextFile(request: { path: string; content: string }): Promise<{ path: string }> {
    this.writeAttempts += 1;
    if (this.failWriteAt !== 0 && this.writeAttempts === this.failWriteAt) {
      throw portError(
        "io_error",
        `write failed (fixture attempt ${this.writeAttempts})`,
        request.path,
      );
    }
    this.files.set(request.path, request.content);
    this.writeCount += 1;
    return { path: request.path };
  }

  async removeFile(request: {
    path: string;
    missingOk?: boolean;
  }): Promise<{ path: string; removed: boolean }> {
    const existed = this.files.delete(request.path);
    if (!existed && request.missingOk !== true) {
      throw portError("not_found", `no such file: ${request.path}`, request.path);
    }
    if (existed) this.removeCount += 1;
    return { path: request.path, removed: existed };
  }

  async createDirectory(request: { path: string }): Promise<{ path: string }> {
    // 内存树没有真实目录概念，建目录是 no-op（`writeTextFile` 自动建父级）。
    return { path: request.path };
  }
}

/** `SessionEventStorePort` 的内存替身。 */
export class InMemoryEventStore {
  private readonly events = new Map<string, unknown[]>();
  private appendSequence = 0;
  private getEventsShouldThrow = false;

  /** 已发生的 append 次数（断言「列表不 append」用）。 */
  appendCount = 0;

  /** 预置事件（按传入顺序；`sequenceNumber` 由事件自身携带）。 */
  seed(events: readonly unknown[]): void {
    const list = this.events.get(SESSION_KEY) ?? [];
    list.push(...events);
    this.events.set(SESSION_KEY, list);
  }

  /** 让 `getEvents` 抛错（用于测 fail closed）。 */
  failGetEvents(): void {
    this.getEventsShouldThrow = true;
  }

  async append(event: unknown): Promise<unknown> {
    this.appendCount += 1;
    this.appendSequence += 1;
    const list = this.events.get(SESSION_KEY) ?? [];
    list.push({ ...(event as object), sequenceNumber: this.appendSequence });
    this.events.set(SESSION_KEY, list);
    return event;
  }

  async getEvents(sessionId: unknown): Promise<unknown[]> {
    if (this.getEventsShouldThrow) {
      throw new Error("event store unavailable (fixture)");
    }
    void sessionId;
    const list = this.events.get(SESSION_KEY) ?? [];
    // 端口契约：按追加顺序可回放 → 按 sequenceNumber 升序返回。
    return [...list].sort(
      (left, right) =>
        (left as { sequenceNumber: number }).sequenceNumber -
        (right as { sequenceNumber: number }).sequenceNumber,
    );
  }
}

/** 替身内部用的会话键（替身只服务单会话测试，不模拟多会话）。 */
const SESSION_KEY = "fixture-session";

/** 判断错误是否端口错误（供测试断言用）。 */
export { isFileSystemPortError };
