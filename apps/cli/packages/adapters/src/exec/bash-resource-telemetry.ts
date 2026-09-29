// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { randomUUID } from "node:crypto";
import os from "node:os";
import { performance } from "node:perf_hooks";
import {
  BASH_RESOURCE_MAX_SAMPLES,
  BASH_RESOURCE_SAMPLE_INTERVAL_MS,
  type KnorviaToolExecResource,
} from "@knorvia/shared";
import { createProcessProbe, type ProcessProbe } from "../device/process-probe.js";
import { subscribeBashOutputProgress } from "./bash-progress-poller.js";

interface BashResourceTelemetryOptions {
  processGroupId?: number;
  platform?: NodeJS.Platform;
  probe?: Pick<ProcessProbe, "sampleProcessGroup">;
  onComplete: (sample: KnorviaToolExecResource) => void;
  readContext?: () => Pick<KnorviaToolExecResource, "cliRssKb" | "systemFreeMemoryKb">;
}

function defaultContext(): Pick<KnorviaToolExecResource, "cliRssKb" | "systemFreeMemoryKb"> {
  return {
    cliRssKb: Math.round(process.memoryUsage().rss / 1024),
    systemFreeMemoryKb: Math.round(os.freemem() / 1024),
  };
}

export function createBashResourceTelemetry(options: BashResourceTelemetryOptions): {
  finish(exitKind: KnorviaToolExecResource["exitKind"]): void;
} {
  const startedAt = performance.now();
  const platform = options.platform ?? process.platform;
  let sealed = false;
  let attempts = 0;
  let sampleCount = 0;
  let peakRssKb = 0;
  let cpuTimeMs = 0;
  const previousCpuByPid = new Map<number, number>();
  let unsubscribe: (() => void) | undefined;

  if (platform !== "win32" && options.processGroupId !== undefined) {
    const probe = options.probe ?? createProcessProbe({ platform });
    unsubscribe = subscribeBashOutputProgress(
      BASH_RESOURCE_SAMPLE_INTERVAL_MS,
      async (isActive) => {
        if (sealed || !isActive() || attempts >= BASH_RESOURCE_MAX_SAMPLES) return;
        attempts += 1;
        try {
          const samples = await probe.sampleProcessGroup(options.processGroupId!);
          if (sealed || !isActive() || !samples) return;
          sampleCount += 1;
          let currentRss = 0;
          for (const sample of samples) {
            currentRss += Math.max(0, sample.rssKb);
            if (sample.cpuTimeMs === undefined) continue;
            const previous = previousCpuByPid.get(sample.pid);
            if (previous !== undefined) cpuTimeMs += Math.max(0, sample.cpuTimeMs - previous);
            previousCpuByPid.set(sample.pid, sample.cpuTimeMs);
          }
          peakRssKb = Math.max(peakRssKb, currentRss);
        } catch {
          // Sampling is diagnostic and cannot affect execution.
        } finally {
          if (attempts >= BASH_RESOURCE_MAX_SAMPLES) unsubscribe?.();
        }
      },
    );
  }

  return {
    finish(exitKind): void {
      if (sealed) return;
      sealed = true;
      unsubscribe?.();
      const durationMs = Math.max(0, performance.now() - startedAt);
      if (durationMs < BASH_RESOURCE_SAMPLE_INTERVAL_MS) return;
      try {
        const context = (options.readContext ?? defaultContext)();
        const sample: KnorviaToolExecResource = {
          completionToken: randomUUID(),
          platform,
          toolName: "bash",
          durationMs,
          exitKind,
          sampleCount,
          ...context,
        };
        if (platform !== "win32") {
          sample.treeRssKbPeak = peakRssKb;
          sample.treeCpuTimeMs = cpuTimeMs;
        }
        const pending = options.onComplete(sample) as unknown;
        if (pending && typeof (pending as PromiseLike<unknown>).then === "function") {
          void Promise.resolve(pending).catch(() => undefined);
        }
      } catch {
        // Context and callback failures are deliberately isolated.
      }
    },
  };
}
