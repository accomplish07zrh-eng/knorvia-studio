// SPDX-License-Identifier: Apache-2.0
// 进程自采样器：把「上一次与这一次的 CPU/时钟读数」换算成一条资源样本。
//
// host 与 scheduler 两个 utilityProcess 各自掌握采样节拍，只在 tick 时把刚读到的
// `process.memoryUsage()` 交给这里换算。本模块不做 IO、不持有定时器，只保存一条基线：
// 构造时即建立基线，因此第一个 tick 就能出样本；每次采样顺带刷新基线。读数抛错、时钟
// 未前进、CPU 计数回退都只丢当前样本（返回 null），不中断后续采样。
import { availableParallelism } from "node:os";
import { bytesToKb } from "../memoryDiagnostics.js";
import type { NodeSelfResourceSample } from "../validation.js";

// CPU 累计读数（用户态 + 内核态，合计微秒）：字段面与 process.cpuUsage() 的返回值一致，
// 注入方可以直接把这个方法交进来。
type CpuReading = { user: number; system: number };

// 一次抓取的两样东西必须成对出现：只有同一刻的 CPU 微秒与单调时钟纳秒才谈得上「差了多少」。
interface ReadingSnapshot {
  cpu: CpuReading;
  clockNs: bigint;
}

// 自采周期固定 60 秒（60 × 1000 毫秒），与本地内存诊断日志保持同一个节拍。
export const NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS = 60 * 1_000;

// 采样器的可注入面：三个读数来源都能换，缺省分别走 process.cpuUsage、process.hrtime 与 os。
// 构造后不再改写，因此字段全部只读。
export type NodeSelfResourceSamplerOptions = {
  readonly readCpuUsage?: () => CpuReading;
  readonly logicalCpuCount?: number;
  readonly readMonotonicTimeNs?: () => bigint;
};

// 采样器只暴露一个方法：拿调用方刚读到的内存快照换一条样本，换不出来就交 null。
export type NodeSelfResourceSampler = {
  // 基线不可用（首次读数失败、时钟未前进、CPU 计数回退）时返回 null，只丢当前样本。
  sample(usage: NodeJS.MemoryUsage): NodeSelfResourceSample | null;
};

// 百分比保留 4 位小数，与 CLI 自采样本同口径；放大与取整共用一个因子，避免两处各写一遍。
const PERCENT_ROUNDING = 10_000;
function toFixedRatio(value: number): number {
  return Math.round(value * PERCENT_ROUNDING) / PERCENT_ROUNDING;
}

// 逻辑核数钳到 [1, 4096]，避免坏载荷把百分比算成 0 或天文数字。
function clampCoreCount(requested: number | undefined): number {
  const resolved = Math.trunc(requested ?? availableParallelism());
  return Math.max(1, Math.min(4_096, resolved));
}

// 两段读数换算成「同时忙了几个核」：CPU 计数是微秒、时钟是纳秒，先把纳秒折成微秒再相除。
// 时钟没往前走、或者 CPU 累计值反而变小，都说明这对读数不可用，交 null 让上层丢掉这一拍。
function busyCoresBetween(newer: ReadingSnapshot, older: ReadingSnapshot): number | null {
  const elapsedNs = newer.clockNs - older.clockNs;
  const usedUs = newer.cpu.user - older.cpu.user + (newer.cpu.system - older.cpu.system);
  if (elapsedNs <= 0n || usedUs < 0) return null;
  return usedUs / (Number(elapsedNs) / 1_000);
}

export const createNodeSelfResourceSampler = (
  settings: NodeSelfResourceSamplerOptions = {},
): NodeSelfResourceSampler => {
  const pollCpu = settings.readCpuUsage ?? (() => process.cpuUsage());
  const pollClock = settings.readMonotonicTimeNs ?? (() => process.hrtime.bigint());
  const coreCount = clampCoreCount(settings.logicalCpuCount);

  // 同一刻成对抓取 CPU 与时钟；读数抛错按缺席处理，只丢这一拍。
  const takeReading = (): ReadingSnapshot | null => {
    try {
      return { cpu: pollCpu(), clockNs: pollClock() };
    } catch {
      return null;
    }
  };

  // 构造时就取一次读数做基线，省得第一个 tick 空转一轮只为了建立基线。
  let baseline = takeReading();

  return {
    sample(usage) {
      const latest = takeReading();
      if (!latest) return null;

      const earlier = baseline;
      baseline = latest;
      if (!earlier) return null;

      const coresBusy = busyCoresBetween(latest, earlier);
      if (coresBusy === null) return null;

      const built: NodeSelfResourceSample = {
        cpuPercent: toFixedRatio((coresBusy / coreCount) * 100),
        rssKb: bytesToKb(usage.rss),
        heapUsedKb: bytesToKb(usage.heapUsed),
      };
      return built;
    },
  };
};