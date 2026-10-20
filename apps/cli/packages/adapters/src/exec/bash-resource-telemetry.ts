// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 单条 bash 命令的资源遥测。采样挂在共享轮询上，按命令自身的起点门控节拍，
// 累计进程树的 RSS 峰值与 CPU 增量；命令结束时同步封口并发出一份摘要。
// 遥测是旁路：任何采样、上下文或回调失败都只能丢掉本次通知，绝不改变命令结果。

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

const KB = 1024;
const TOOL_NAME = "bash";

/** 一次命令的采样累计：峰值 RSS、CPU 增量和成功采样数。 */
type Tally = {
  peakRssKb: number;
  cpuMs: number;
  samples: number;
};

type TelemetryAsk = {
  processGroupId?: number;
  platform?: NodeJS.Platform;
  probe?: Pick<ProcessProbe, "sampleProcessGroup">;
  onComplete: (sample: KnorviaToolExecResource) => void;
  readContext?: () => Pick<KnorviaToolExecResource, "cliRssKb" | "systemFreeMemoryKb">;
};

/** 当前进程与系统的内存视图；调用方可以覆盖它。 */
function readDefaultContext(): Pick<KnorviaToolExecResource, "cliRssKb" | "systemFreeMemoryKb"> {
  return {
    cliRssKb: Math.round(process.memoryUsage().rss / KB),
    systemFreeMemoryKb: Math.round(os.freemem() / KB),
  };
}

/**
 * 把一批进程样本折算进累计值：RSS 累加后取峰值，CPU 用相邻两次读数之差累加。
 * 首次见到某个 pid 时没有基线，只记基线不累加，避免把进程生命周期的总 CPU 算进来。
 */
function foldSamples(
  rows: ReadonlyArray<{ pid: number; rssKb: number; cpuTimeMs?: number }>,
  tally: Tally,
  lastCpuByPid: Map<number, number>,
): void {
  let rssSum = 0;
  for (const row of rows) {
    rssSum += Math.max(0, row.rssKb);
    if (row.cpuTimeMs === undefined) continue;
    const baseline = lastCpuByPid.get(row.pid);
    if (baseline !== undefined) tally.cpuMs += Math.max(0, row.cpuTimeMs - baseline);
    lastCpuByPid.set(row.pid, row.cpuTimeMs);
  }
  tally.samples += 1;
  tally.peakRssKb = Math.max(tally.peakRssKb, rssSum);
}

/** 组装要发出的摘要：win32 没有进程树口径，因此不带树字段。 */
function buildSample(
  platform: NodeJS.Platform,
  durationMs: number,
  exitKind: KnorviaToolExecResource["exitKind"],
  tally: Tally,
  context: Pick<KnorviaToolExecResource, "cliRssKb" | "systemFreeMemoryKb">,
): KnorviaToolExecResource {
  const sample = {} as KnorviaToolExecResource;
  sample.completionToken = randomUUID();
  sample.platform = platform;
  sample.toolName = TOOL_NAME;
  sample.durationMs = durationMs;
  sample.exitKind = exitKind;
  sample.sampleCount = tally.samples;
  sample.cliRssKb = context.cliRssKb;
  sample.systemFreeMemoryKb = context.systemFreeMemoryKb;
  if (platform !== "win32") {
    sample.treeRssKbPeak = tally.peakRssKb;
    sample.treeCpuTimeMs = tally.cpuMs;
  }
  return sample;
}

/** 回调可能返回 promise；同步异常与异步拒绝都只丢本次通知。 */
function fireAndForget(emit: () => unknown): void {
  try {
    const pending = emit() as unknown;
    const isThenable =
      pending !== null && typeof (pending as PromiseLike<unknown>)?.then === "function";
    if (isThenable) void Promise.resolve(pending).catch(() => undefined);
  } catch {
    // 上下文读取或回调本身失败都不影响命令结果。
  }
}

export function createBashResourceTelemetry(ask: TelemetryAsk): {
  finish(exitKind: KnorviaToolExecResource["exitKind"]): void;
} {
  const platform = ask.platform ?? process.platform;
  const groupId = ask.processGroupId;
  const startedAt = performance.now();
  const tally: Tally = { peakRssKb: 0, cpuMs: 0, samples: 0 };
  const lastCpuByPid = new Map<number, number>();
  let sealed = false;
  let attempts = 0;
  let stopSampling: (() => void) | undefined;

  const samplingNeeded = platform !== "win32" && groupId !== undefined;
  if (samplingNeeded) {
    const probe = ask.probe ?? createProcessProbe({ platform });
    stopSampling = subscribeBashOutputProgress(BASH_RESOURCE_SAMPLE_INTERVAL_MS, async (alive) => {
      const canSample = !sealed && alive() && attempts < BASH_RESOURCE_MAX_SAMPLES;
      if (!canSample) return;
      attempts += 1;
      let rows: Awaited<ReturnType<typeof probe.sampleProcessGroup>>;
      try {
        rows = await probe.sampleProcessGroup(groupId);
      } catch {
        // 单次采样失败只丢这一拍。
        return;
      }
      if (sealed || !alive() || !rows) return;
      foldSamples(rows, tally, lastCpuByPid);
      if (attempts >= BASH_RESOURCE_MAX_SAMPLES) stopSampling?.();
    });
  }

  return {
    finish(exitKind): void {
      if (sealed) return;
      sealed = true;
      stopSampling?.();
      lastCpuByPid.clear();
      const durationMs = Math.max(0, performance.now() - startedAt);
      // 短于一个采样周期的命令不产生摘要：既没有样本，也没有可对比的时长。
      if (durationMs < BASH_RESOURCE_SAMPLE_INTERVAL_MS) return;
      fireAndForget(() => {
        const context = (ask.readContext ?? readDefaultContext)();
        ask.onComplete(buildSample(platform, durationMs, exitKind, tally, context));
      });
    },
  };
}
