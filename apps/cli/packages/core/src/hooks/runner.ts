// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { HookInput, Logger, SessionEvent } from "@knorvia/contracts";
import { driveHookPlan } from "./runner-driver.js";
import { eventFor } from "./runner-lifecycle.js";
import { batchPlan } from "./runner-program.js";
import type { HookOccurrence, HookReport } from "./runner-plan.js";
import type {
  HookRegistration,
  HookRunOptions,
  HookRunResult,
  HookRunner,
  HookRunnerOptions,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 60_000;

export class InMemoryHookRunner implements HookRunner {
  private readonly defaultTimeoutMs: number;
  private readonly emitEvent?: (event: SessionEvent) => Promise<void>;
  private readonly hooks: HookRegistration[];
  private readonly logger?: Logger;

  constructor(options: HookRunnerOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.emitEvent = options.emitEvent;
    this.hooks = Array.from(options.hooks ?? []);
    this.logger = options.logger;
  }

  register(hook: HookRegistration): void {
    this.hooks.push(hook);
  }

  run(input: HookInput, options: HookRunOptions = {}): Promise<HookRunResult> {
    const ports = {
      defaultTimeoutMs: this.defaultTimeoutMs,
      logger: this.logger,
      publish: (occurrence: HookOccurrence, report: HookReport) => this.publish(occurrence, report),
    };
    return driveHookPlan(batchPlan(this.hooks, input, options, ports), ports);
  }

  private async publish(occurrence: HookOccurrence, report: HookReport): Promise<void> {
    if (this.emitEvent) await this.emitEvent(eventFor(occurrence, report));
  }
}

export function createInMemoryHookRunner(options?: HookRunnerOptions): InMemoryHookRunner {
  return new InMemoryHookRunner(options);
}
