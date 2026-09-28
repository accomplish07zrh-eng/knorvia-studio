// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export type ResponderSource = "hook" | "broker";
type Phase = "open" | "broker-claimed" | "settled";

/** One request's authority, separate from responder signals and Promise delivery. */
export class ResponderChoice {
  private phase: Phase = "open";

  get settled(): boolean {
    return this.phase === "settled";
  }

  claimBroker(): boolean {
    if (this.settled) return false;
    // 用户提交失败后仍可重试；保留 broker 归属，不把 claim 当成已完成。
    this.phase = "broker-claimed";
    return true;
  }

  accept(source: ResponderSource): boolean {
    if (this.settled || (source === "hook" && this.phase === "broker-claimed")) return false;
    this.phase = "settled";
    return true;
  }
}
