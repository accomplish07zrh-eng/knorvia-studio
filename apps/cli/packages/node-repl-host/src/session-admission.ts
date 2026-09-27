// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { addAbortListener } from "node:events";

type Slot = { run(): Promise<void>; reject(reason: unknown): void };
type Lane = { running: boolean; pending: Slot[] };
type SessionKey = string | symbol;

/** Exactly one FIFO owns JS admission for each normalized session. */
export class SessionAdmission {
  readonly #lanes = new Map<SessionKey, Lane>();
  // 字符串哨兵会与真实 session_id 冲突；缺省会话使用不可由请求构造的私有键。
  readonly #unscoped = Symbol("unscoped execution");
  readonly #signal: AbortSignal;

  constructor(signal: AbortSignal) {
    this.#signal = signal;
    addAbortListener(signal, () => {
      for (const lane of this.#lanes.values()) {
        for (const slot of lane.pending.splice(0)) slot.reject(signal.reason);
      }
      this.#lanes.clear();
    });
  }

  submit<T>(session: string | undefined, operation: () => Promise<T>): Promise<T> {
    if (this.#signal.aborted) return Promise.reject(this.#signal.reason);
    const key = session ?? this.#unscoped;
    const lane = this.#lanes.get(key) ?? { running: false, pending: [] };
    this.#lanes.set(key, lane);
    const result = Promise.withResolvers<T>();
    lane.pending.push({
      reject: result.reject,
      async run() {
        try {
          result.resolve(await operation());
        } catch (error) {
          result.reject(error);
        }
      },
    });
    if (!lane.running) void this.#drain(key, lane);
    return result.promise;
  }

  async #drain(key: SessionKey, lane: Lane): Promise<void> {
    lane.running = true;
    while (!this.#signal.aborted && lane.pending.length) {
      await lane.pending.shift()!.run();
    }
    if (this.#lanes.get(key) === lane) this.#lanes.delete(key);
  }
}
