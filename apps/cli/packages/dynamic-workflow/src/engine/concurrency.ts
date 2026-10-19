// SPDX-License-Identifier: Apache-2.0
// 自适应并发控制器：一个 provider key 上的 AIMD 状态机。
// 控制器不读时钟、不做 I/O；每次信号都带上调用方的时刻，纯状态因此可重放。

import type { ConcurrencyChange, ConcurrencyChangeReason } from "./types.js";

export const CONCURRENCY_FLOOR = 1;
export const CONCURRENCY_IDLE_RESET_MS = 300_000;
export const CONCURRENCY_INCREASE_STEP = 1;
export const CONCURRENCY_DECREASE_FACTOR = 0.75;
export const CONCURRENCY_INCREASE_AFTER_SUCCESSES = 4;

// 会压低 cap 的三类限流原因。
export type ConcurrencyThrottleReason = "rate_limited" | "provider_overloaded" | "offpeak_queued";

// 快照的实时水位面：每次派发都要读。
interface ConcurrencyAdmissionSnapshot {
  readonly key: string;
  readonly ceiling: number;
  readonly cap: number;
  readonly epoch: number;
  readonly inFlight: number;
  readonly waiters: number;
}

// 快照的学习面：退避、最近请求与探测历史。
interface ConcurrencyLearningSnapshot {
  readonly successStreak: number;
  readonly cooldownUntil?: number;
  readonly lastRequestAt?: number;
  readonly lastGood?: number;
  readonly lastBad?: number;
}

export interface ConcurrencyControllerSnapshot
  extends ConcurrencyAdmissionSnapshot, ConcurrencyLearningSnapshot {}

interface ControllerState {
  key: string;
  ceiling: number;
  limit: number;
  epoch: number;
  inFlight: number;
  queued: number;
  streak: number;
  cooldownUntil?: number;
  lastAdmission?: number;
  provenLimit?: number;
  failedProbe?: number;
}

export class ConcurrencyController {
  readonly #state: ControllerState;

  constructor(key: string, ceiling: number) {
    this.#state = {
      key,
      ceiling,
      limit: ceiling,
      epoch: 0,
      inFlight: 0,
      queued: 0,
      streak: 0,
    };
  }

  get key(): string {
    return this.#state.key;
  }

  get ceiling(): number {
    return this.#state.ceiling;
  }

  snapshot(): ConcurrencyControllerSnapshot {
    const s = this.#state;
    const { key, ceiling } = this;
    const admission: ConcurrencyAdmissionSnapshot = {
      key,
      ceiling,
      cap: s.limit,
      epoch: s.epoch,
      inFlight: s.inFlight,
      waiters: s.queued,
    };
    const view = {
      ...admission,
      successStreak: s.streak,
      ...(s.cooldownUntil === undefined ? {} : { cooldownUntil: s.cooldownUntil }),
      ...(s.lastAdmission === undefined ? {} : { lastRequestAt: s.lastAdmission }),
      ...(s.provenLimit === undefined ? {} : { lastGood: s.provenLimit }),
      ...(s.failedProbe === undefined ? {} : { lastBad: s.failedProbe }),
    };
    return view;
  }

  canAdmit(timestampMs: number): boolean {
    const { inFlight, limit, cooldownUntil } = this.#state;
    const saturated = inFlight >= limit;
    const cooling = cooldownUntil !== undefined && timestampMs < cooldownUntil;
    return !saturated && !cooling;
  }

  admitted(timestampMs: number): number {
    const s = this.#state;
    s.lastAdmission = timestampMs;
    s.inFlight += 1;
    return s.epoch;
  }

  observe(timestampMs: number): ConcurrencyChange[] {
    return this.#refresh(timestampMs);
  }

  ended(timestampMs: number): ConcurrencyChange[] {
    const events = this.#refresh(timestampMs);
    this.#collect();
    return events;
  }

  failedTransient(timestampMs: number): ConcurrencyChange[] {
    const events = this.#refresh(timestampMs);
    this.#collect();
    this.#state.streak = 0;
    return events;
  }

  waiters(timestampMs: number, queueDepth: number): ConcurrencyChange[] {
    const events = this.#refresh(timestampMs);
    this.#state.queued = Math.max(0, queueDepth);
    return events;
  }

  succeeded(timestampMs: number, batchEpoch: number): ConcurrencyChange[] {
    const events = this.#refresh(timestampMs);
    this.#collect();
    const s = this.#state;
    if (batchEpoch !== s.epoch) return events;
    s.streak += 1;
    if (s.streak < CONCURRENCY_INCREASE_AFTER_SUCCESSES) return events;
    if (s.provenLimit === undefined || s.limit > s.provenLimit) s.provenLimit = s.limit;
    if (s.queued <= 0 || s.limit >= this.ceiling) return events;
    const previous = s.limit;
    s.limit = Math.min(this.ceiling, previous + CONCURRENCY_INCREASE_STEP);
    s.streak = 0;
    events.push(this.#event(previous, "recovered"));
    return events;
  }

  throttled(
    timestampMs: number,
    batchEpoch: number,
    throttleReason: ConcurrencyThrottleReason,
    backoffMs?: number,
  ): ConcurrencyChange[] {
    const events = this.#refresh(timestampMs);
    this.#collect();
    const s = this.#state;
    s.streak = 0;
    const backoff = backoffMs !== undefined && backoffMs > 0 ? backoffMs : undefined;
    if (backoff !== undefined) {
      const until = timestampMs + backoff;
      s.cooldownUntil = Math.max(s.cooldownUntil ?? 0, until);
    }
    if (batchEpoch !== s.epoch) return events;
    const previous = s.limit;
    // 在已证明水位之上被限流：退回已知水位，不按系数再砍。
    if (s.provenLimit !== undefined && previous > s.provenLimit) {
      s.failedProbe = previous;
      s.limit = s.provenLimit;
    }
    // 墙下移，或从未证明过：按系数减，并清掉刚被证伪的证书。
    if (s.provenLimit === undefined || previous <= s.provenLimit) {
      s.limit = Math.max(CONCURRENCY_FLOOR, Math.floor(previous * CONCURRENCY_DECREASE_FACTOR));
      s.failedProbe = previous;
      s.provenLimit = undefined;
    }
    s.epoch += 1;
    if (previous === s.limit && backoff === undefined) return events;
    const change = this.#event(previous, throttleReason);
    events.push(backoff === undefined ? change : { ...change, cooldownMs: backoff });
    return events;
  }

  // 空闲重置：无在飞且距上次准入超过窗口时，忘掉学到的水位并翻页。
  #refresh(timestampMs: number): ConcurrencyChange[] {
    const s = this.#state;
    if (s.lastAdmission === undefined || s.inFlight !== 0) return [];
    if (timestampMs - s.lastAdmission < CONCURRENCY_IDLE_RESET_MS) return [];
    const previous = s.limit;
    const dirty =
      s.streak !== 0 ||
      s.cooldownUntil !== undefined ||
      s.provenLimit !== undefined ||
      s.failedProbe !== undefined ||
      previous !== this.ceiling;
    if (!dirty) return [];
    s.limit = this.ceiling;
    s.streak = 0;
    s.cooldownUntil = undefined;
    s.provenLimit = undefined;
    s.failedProbe = undefined;
    s.epoch += 1;
    return previous === this.ceiling ? [] : [this.#event(previous, "idle_reset")];
  }

  #collect(): void {
    const s = this.#state;
    if (s.inFlight > 0) s.inFlight -= 1;
  }

  #event(previous: number, reason: ConcurrencyChangeReason): ConcurrencyChange {
    const s = this.#state;
    const base = { key: this.key, previous, next: s.limit, reason };
    const good = s.provenLimit === undefined ? {} : { lastGood: s.provenLimit };
    const bad = s.failedProbe === undefined ? {} : { lastBad: s.failedProbe };
    return { ...base, ...good, ...bad };
  }
}
