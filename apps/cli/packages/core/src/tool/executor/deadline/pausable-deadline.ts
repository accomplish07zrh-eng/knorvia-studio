// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { BudgetLedger } from "./budget-ledger.js";

export class ToolDeadline {
  private readonly budget: BudgetLedger;
  private alarm?: { handle: ReturnType<typeof setTimeout>; began: number };
  private expiry?: () => void;
  constructor(readonly timeoutMs: number | undefined) {
    this.budget = new BudgetLedger(timeoutMs);
  }
  start(onExpire: () => void): void {
    this.expiry = onExpire;
    this.schedule();
  }
  pause(): void {
    if (!this.budget.enterWait(() => Date.now(), this.alarm?.began)) return;
    this.unschedule();
  }
  resume(): void {
    if (this.budget.leaveWait(() => Date.now())) this.schedule();
  }
  clear(): void {
    this.unschedule();
    this.expiry = undefined;
  }
  get queuedMs(): number {
    return this.budget.queuedAt(() => Date.now());
  }

  private schedule(): void {
    if (!this.expiry || this.budget.remaining === undefined || this.budget.waiting) return;
    const began = Date.now();
    const handle = setTimeout(() => {
      this.alarm = undefined;
      this.expiry?.();
    }, this.budget.remaining);
    this.alarm = { began, handle };
  }
  private unschedule(): void {
    if (this.alarm) clearTimeout(this.alarm.handle);
    this.alarm = undefined;
  }
}
