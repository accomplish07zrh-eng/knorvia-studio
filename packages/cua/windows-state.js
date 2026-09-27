import { createHash, randomUUID } from "node:crypto";
import { reject } from "./windows-contract.js";

// 固定大小的拒绝集合只会误拒绝、不会漏掉旧标识。TTL 清理载荷后仍不能复活已停止的轮次或旧动作。
class DeniedIdentifiers {
  bits = new Uint8Array(16384);
  positions(value) {
    const digest = createHash("sha256").update(value).digest();
    return [0, 4, 8].map((offset) => digest.readUInt32LE(offset) % (this.bits.length * 8));
  }
  has(value) {
    return this.positions(value).every((bit) => (this.bits[bit >> 3] & (1 << (bit & 7))) !== 0);
  }
  add(value) {
    for (const bit of this.positions(value)) this.bits[bit >> 3] |= 1 << (bit & 7);
  }
}

export const scopeKey = (context) =>
  JSON.stringify([context.workspaceKey, context.sessionId, context.turnId]);
export const sessionKey = (context) => JSON.stringify([context.workspaceKey, context.sessionId]);
export const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class WindowsComputerState {
  scopes = new Map();
  closed = new DeniedIdentifiers();
  closedSessions = new DeniedIdentifiers();
  disposed = false;
  constructor(options) {
    this.now = options.now;
    this.scopeTtlMs = options.scopeTtlMs;
    this.requestTtlMs = options.requestTtlMs;
    this.maxScopes = options.maxScopes;
    this.maxRequests = options.maxRequests;
    this.onStop = options.onStop;
  }
  sweep() {
    const now = this.now();
    for (const [key, scope] of this.scopes) {
      for (const [requestId, request] of scope.requests)
        if (request.expiresAt <= now) scope.requests.delete(requestId);
      if (scope.expiresAt <= now && !scope.pending) {
        this.stop(scope);
        if (!scope.pending) this.scopes.delete(key);
      }
    }
  }
  get(context) {
    if (this.disposed) reject("runtime_disposed", "Computer control is closed.");
    this.sweep();
    const key = scopeKey(context);
    const existing = this.scopes.get(key);
    if (existing) return existing;
    if (this.closed.has(key) || this.closedSessions.has(sessionKey(context)))
      reject("turn_stopped", "Computer control for this turn has ended; start a new turn.");
    if (this.scopes.size >= this.maxScopes) {
      const idle = [...this.scopes.values()].find((scope) => !scope.pending);
      if (!idle) reject("runtime_busy", "The computer runtime is at its scope limit.");
      this.stop(idle);
      this.scopes.delete(idle.key);
    }
    const scope = {
      key,
      context,
      expiresAt: this.now() + this.scopeTtlMs,
      windows: new Map(),
      requests: new Map(),
      usedRequests: new DeniedIdentifiers(),
      stopped: false,
      pending: 0,
      controllers: new Set(),
      version: 0,
      grant: undefined,
      observation: undefined,
    };
    this.scopes.set(key, scope);
    return scope;
  }
  assertLive(scope) {
    if (this.disposed || scope.stopped || (scope.expiresAt <= this.now() && !scope.pending)) {
      this.stop(scope);
      reject("turn_stopped", "Computer control for this turn has ended; start a new turn.");
    }
  }
  touch(scope) {
    scope.expiresAt = this.now() + this.scopeTtlMs;
  }
  stop(scope) {
    // 必须同步落停止屏障，再取消子进程；已排队的调用随后也会读到相同屏障。
    const wasStopped = scope.stopped;
    scope.stopped = true;
    scope.grant = undefined;
    scope.observation = undefined;
    this.closed.add(scope.key);
    for (const controller of scope.controllers)
      controller.abort(new Error("Computer turn stopped"));
    if (!wasStopped) this.onStop?.(scope.key);
  }
  rememberWindow(scope, window) {
    const identity = fingerprint([
      window.windowId,
      window.pid,
      window.processStartedAt,
      window.driverGeneration,
    ]);
    for (const [id, entry] of scope.windows)
      if (entry.identity === identity) {
        entry.window = window;
        entry.expiresAt = this.now() + 60000;
        return id;
      }
    if (scope.windows.size >= 256) {
      const oldest = scope.windows.keys().next().value;
      scope.windows.delete(oldest);
    }
    const id = `window_${randomUUID()}`;
    scope.windows.set(id, { identity, window, expiresAt: this.now() + 60000 });
    return id;
  }
  listedWindow(scope, id) {
    const entry = scope.windows.get(id);
    if (!entry || entry.expiresAt <= this.now())
      reject("window_not_listed", "List windows again before requesting control.");
    return entry.window;
  }
  claim(scope, args) {
    const hash = fingerprint(args);
    const existing = scope.requests.get(args.requestId);
    if (existing) {
      if (existing.hash !== hash)
        reject("request_conflict", "The request ID was already used with different parameters.");
      return { previous: existing.result };
    }
    if (scope.usedRequests.has(args.requestId))
      reject(
        "request_already_used",
        "The request ID was already used; its result expired and must not be replayed.",
      );
    if (scope.requests.size >= this.maxRequests) {
      const oldest = scope.requests.keys().next().value;
      scope.requests.delete(oldest);
    }
    scope.usedRequests.add(args.requestId);
    const entry = { hash, expiresAt: this.now() + this.requestTtlMs, result: undefined };
    scope.requests.set(args.requestId, entry);
    return { entry };
  }
  closeSession(context) {
    const keys = [];
    this.closedSessions.add(sessionKey(context));
    for (const scope of this.scopes.values())
      if (sessionKey(scope.context) === sessionKey(context)) {
        this.stop(scope);
        keys.push(scope.key);
      }
    return keys;
  }
  dispose() {
    this.disposed = true;
    for (const scope of this.scopes.values()) this.stop(scope);
  }
}
