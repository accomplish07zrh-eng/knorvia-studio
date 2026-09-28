// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

/** 一次工具的时间账本；等待区间闭合后才并入累计量，没有定时器或外部状态。 */
export class BudgetLedger {
  private wait?: { since: number; depth: number };
  private closedWaitMs = 0;
  remaining: number | undefined;
  constructor(allowance: number | undefined) {
    this.remaining = allowance;
  }
  get waiting() {
    return this.wait !== undefined;
  }

  enterWait(now: () => number, runningSince?: number): boolean {
    if (this.wait) {
      this.wait.depth++;
      return false;
    }
    const since = now();
    this.wait = { since, depth: 1 };
    if (runningSince !== undefined)
      this.remaining = Math.max(0, (this.remaining ?? 0) - (since - runningSince));
    return true;
  }
  leaveWait(now: () => number): boolean {
    if (!this.wait || --this.wait.depth !== 0) return false;
    this.closedWaitMs += now() - this.wait.since;
    this.wait = undefined;
    return true;
  }
  queuedAt(now: () => number): number {
    return this.closedWaitMs + (this.wait ? now() - this.wait.since : 0);
  }
}
