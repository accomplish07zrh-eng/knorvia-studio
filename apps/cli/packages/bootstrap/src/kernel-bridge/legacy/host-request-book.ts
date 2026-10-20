// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：反向请求登记表（CLI → Host）。
//
// 状态所有者：本文件。唯一写入者是 `requestHost`（登记）与 `settleHostRequest`（收口）。
// 语义按 behavior B11/B12 与默认引擎实测：
//   - id 用 `server-<n>` 前缀，与客户端 id 空间分离（L/B11 时序小节）；
//   - 无传输通道 / 通道已断 → -32020；signal 中止 → -32021；超时 → -32022 + data.timeoutMs；
//   - 超时/取消/连接关闭都必须清掉 pending，不泄漏定时器（B11 资源释放）。

import { LEGACY_ERROR_CODES } from "./errors.js";

/** 反向请求重发现初始间隔与上限（既有常量，见 behavior.md 语义常量清单）。 */
export const INITIAL_REANNOUNCE_INTERVAL_MS = 1_000;
export const MAX_REANNOUNCE_INTERVAL_MS = 10_000;

/** 反向请求的最小传输面：写一行 + 连接状态。 */
export interface HostRequestChannel {
  readonly connected: boolean;
  write(message: Readonly<Record<string, unknown>>): void;
}

/** 反向请求选项。 */
export interface HostRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly reannounceIntervalMs?: number;
  readonly trace?: Readonly<Record<string, unknown>>;
  /**
   * 中止/超时回调（B12）。
   *
   * `interaction/requestProviderRuntimeHeaders` 在被取消或超时时，除失败外还必须**额外**
   * 发一条 `interaction/providerRuntimeHeadersCancelled` 通知，让 Host 有机会收掉自己一侧的
   * 待授权状态。把钩子挂在收口点上，保证「取消/超时」与「发通知」是同一件事的两个副作用，
   * 不会出现只失败不通知（或反之）的错配。
   *
   * 只在**中止与超时**时调用；客户端明确回错误时不调用（那是业务应答，不是取消）。
   */
  readonly onCancelled?: (reason: "timeout" | "aborted" | "disconnected") => void;
}

interface PendingRequest {
  readonly id: string;
  readonly method: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: LegacyHostRequestError) => void;
  timer?: ReturnType<typeof setTimeout>;
  reannounceTimer?: ReturnType<typeof setTimeout>;
  readonly signal?: AbortSignal;
  onAbort?: () => void;
  /** 中止/超时/断开的通知钩子（B12）。 */
  readonly onCancelled?: (reason: "timeout" | "aborted" | "disconnected") => void;
}

/** 反向请求失败：带既有错误码，供调用方按码分支（B11/B12）。 */
export class LegacyHostRequestError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "LegacyHostRequestError";
  }
}

/**
 * 反向请求登记表。
 *
 * 一个桥实例一份。`connected` 由传输侧维护（stdin 关闭即为 false）。
 */
export class HostRequestBook {
  private readonly pending = new Map<string, PendingRequest>();
  private nextId = 0;
  private channel: HostRequestChannel | undefined;

  /** 绑定传输通道；EOF/断开时传 undefined。 */
  setChannel(channel: HostRequestChannel | undefined): void {
    this.channel = channel;
    // 通道关闭：所有在途反向请求按「无客户端」失败，并清掉定时器（B11 资源释放）。
    if (channel === undefined || !channel.connected) this.failAllAsDisconnected();
  }

  /** 在途反向请求数（测试与收尾用）。 */
  pendingCount(): number {
    return this.pending.size;
  }

  /**
   * 发起一个反向请求，等待 Host 的应答。
   *
   * @throws LegacyHostRequestError 无客户端 -32020 / 取消 -32021 / 超时 -32022。
   */
  request<T>(
    method: string,
    params: unknown,
    resultSchema: { parse(value: unknown): T },
    options: HostRequestOptions = {},
  ): Promise<T> {
    const channel = this.channel;
    if (channel === undefined || !channel.connected) {
      return Promise.reject(
        new LegacyHostRequestError(
          LEGACY_ERROR_CODES.clientRequestUnavailable,
          `No client is connected for ${method}`,
        ),
      );
    }
    if (options.signal?.aborted === true) {
      return Promise.reject(
        new LegacyHostRequestError(
          LEGACY_ERROR_CODES.clientRequestCancelled,
          `Client request cancelled: ${method}`,
        ),
      );
    }

    const id = `server-${(this.nextId += 1)}`;
    return new Promise<T>((resolve, reject) => {
      const entry: PendingRequest = {
        id,
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.onCancelled !== undefined ? { onCancelled: options.onCancelled } : {}),
      };

      if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          this.settle(id, () => {
            options.onCancelled?.("timeout");
            reject(
              new LegacyHostRequestError(
                LEGACY_ERROR_CODES.clientRequestTimeout,
                `Client request timed out: ${method}`,
                { timeoutMs: options.timeoutMs },
              ),
            );
          });
        }, options.timeoutMs);
        entry.timer.unref?.();
      }

      if (options.signal !== undefined) {
        const onAbort = (): void => {
          this.settle(id, () => {
            options.onCancelled?.("aborted");
            reject(
              new LegacyHostRequestError(
                LEGACY_ERROR_CODES.clientRequestCancelled,
                `Client request cancelled: ${method}`,
              ),
            );
          });
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
        entry.onAbort = onAbort;
      }

      this.pending.set(id, entry);
      this.announce(entry, params, options);
    });
  }

  /**
   * 消费客户端发来的一行 response（反向请求的应答）。
   *
   * @returns 是否命中某个在途请求；未命中返回 false（晚到应答是无害幂等操作，B12）。
   */
  settleFromClient(id: string, payload: { result?: unknown; error?: unknown }): boolean {
    const entry = this.findByWireId(id);
    if (entry === undefined) return false;
    const error = payload.error;
    if (error !== undefined && typeof error === "object" && error !== null) {
      const code = "code" in error && typeof error.code === "number" ? error.code : undefined;
      const message =
        "message" in error && typeof error.message === "string"
          ? error.message
          : `Client request failed: ${entry.method}`;
      this.settle(entry.id, () =>
        entry.reject(
          new LegacyHostRequestError(
            code ?? LEGACY_ERROR_CODES.clientRequestUnavailable,
            message,
            "data" in error ? error.data : undefined,
          ),
        ),
      );
      return true;
    }
    this.settle(entry.id, () => entry.resolve(payload.result));
    return true;
  }

  /** 关闭时清空所有在途请求（幂等）。 */
  dispose(): void {
    this.failAllAsDisconnected();
    this.channel = undefined;
  }

  private findByWireId(wireId: string): PendingRequest | undefined {
    for (const entry of this.pending.values()) if (entry.id === wireId) return entry;
    return undefined;
  }

  /** 收口一个在途请求：先摘表清定时器，再执行终结动作（保证不泄漏）。 */
  private settle(id: string, finalize: () => void): void {
    const entry = this.pending.get(id);
    if (entry === undefined) return;
    this.pending.delete(id);
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    if (entry.reannounceTimer !== undefined) clearTimeout(entry.reannounceTimer);
    if (entry.signal !== undefined && entry.onAbort !== undefined) {
      entry.signal.removeEventListener("abort", entry.onAbort);
    }
    finalize();
  }

  private failAllAsDisconnected(): void {
    const entries = [...this.pending.values()];
    for (const entry of entries) {
      this.settle(entry.id, () => {
        // 连接断开也是「取消」的一种：B12 的取消通知同样要发，否则 Host 侧的待授权状态会悬挂。
        entry.onCancelled?.("disconnected");
        entry.reject(
          new LegacyHostRequestError(
            LEGACY_ERROR_CODES.clientRequestUnavailable,
            `No client is connected for ${entry.method}`,
          ),
        );
      });
    }
  }

  /**
   * 发出反向请求。重发现语义：同一业务 requestId 按间隔重复发出，直到应答或失败。
   * 默认间隔来自 options，未给则按既有 1s 起、指数退避到 10s 上限。
   */
  private announce(entry: PendingRequest, params: unknown, options: HostRequestOptions): void {
    const write = (): void => {
      this.channel?.write({
        id: entry.id,
        method: entry.method,
        params,
        ...(options.trace !== undefined ? { trace: options.trace } : {}),
      });
    };
    write();

    // 只有显式给了 reannounceIntervalMs 才做重发现：默认引擎的会话偏好请求不重发，
    // 交互请求才按 1s→10s 退避重发现。默认关闭，避免无谓的重复流量。
    const initial = options.reannounceIntervalMs;
    if (initial === undefined || initial <= 0) return;
    let interval = Math.min(initial, MAX_REANNOUNCE_INTERVAL_MS);
    const schedule = (): void => {
      entry.reannounceTimer = setTimeout(() => {
        if (!this.pending.has(entry.id)) return;
        if (this.channel === undefined || !this.channel.connected) {
          this.settle(entry.id, () =>
            entry.reject(
              new LegacyHostRequestError(
                LEGACY_ERROR_CODES.clientRequestUnavailable,
                `No client is connected for ${entry.method}`,
              ),
            ),
          );
          return;
        }
        write();
        interval = Math.min(interval * 2, MAX_REANNOUNCE_INTERVAL_MS);
        schedule();
      }, interval);
      entry.reannounceTimer.unref?.();
    };
    schedule();
  }
}
