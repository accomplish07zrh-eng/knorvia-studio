// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio: implemented from the frozen process-probe contract, 2026-09-30.
import { readdir, readFile } from "node:fs/promises";
import { readDarwinProcessGroup, readDarwinProcessTable } from "./process-probe-darwin.js";
import {
  sampleLinuxProcessGroup,
  sampleLinuxProcessTrees,
  type LinuxProcReaders,
} from "./process-probe-linux.js";
import { readWindowsProcessMemory } from "./process-probe-windows.js";
import {
  defaultProbeExecFile,
  groupProcessTrees,
  isSamplablePid,
  PROCESS_PROBE_SAMPLE_TIMEOUT_MS,
  ProcessProbeFailure,
  toSample,
  type ProcessProbeExecFile,
  type ProcessProbeSample,
} from "./process-probe-shared.js";
export {
  PROCESS_PROBE_SAMPLE_TIMEOUT_MS,
  type ProcessProbeCommandResult,
  type ProcessProbeExecFile,
  type ProcessProbeSample,
} from "./process-probe-shared.js";
export type ProcessTreeScope = "direct_process" | "process_tree";
export interface ProcessProbe {
  sampleProcessTrees(
    rootPids: readonly number[],
  ): Promise<ReadonlyMap<number, readonly ProcessProbeSample[]> | undefined>;
  sampleProcessGroup(processGroupId: number): Promise<readonly ProcessProbeSample[] | undefined>;
  reset(): void;
  readonly treeScope: ProcessTreeScope;
}
interface CreateProcessProbeOptions {
  execFile?: ProcessProbeExecFile;
  listProcDirectory?: () => Promise<readonly string[]>;
  onSampleFailed?: (reason: string) => void;
  platform?: NodeJS.Platform;
  readProcFile?: (path: string) => Promise<string>;
}
const FAILURE_LIMIT = 3;
const PROC_ROOT = "/proc";

/** 唯一的连续失败所有者是实例；每次调用另外持有自己的截止，允许原有并发语义。 */
export function createProcessProbe(options: CreateProcessProbeOptions = {}): ProcessProbe {
  const platform = options.platform ?? process.platform;
  const executor = options.execFile ?? defaultProbeExecFile;
  let failures = 0;
  const procReaders = (isExpired: () => boolean): LinuxProcReaders => ({
    listProcDirectory: options.listProcDirectory ?? (() => readdir(PROC_ROOT)),
    readProcFile: options.readProcFile ?? ((path) => readFile(path, "utf8")),
    isExpired,
  });

  async function sample<T>(
    operation: (isExpired: () => boolean) => Promise<T>,
  ): Promise<T | undefined> {
    if (failures >= FAILURE_LIMIT) return undefined;
    let expired = false;
    let handle: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      handle = setTimeout(() => {
        expired = true;
        reject(new ProcessProbeFailure(`采样超过 ${PROCESS_PROBE_SAMPLE_TIMEOUT_MS} 毫秒`));
      }, PROCESS_PROBE_SAMPLE_TIMEOUT_MS);
      handle.unref?.();
    });
    try {
      const value = await Promise.race([operation(() => expired), deadline]);
      failures = 0;
      return value;
    } catch (error) {
      failures++;
      try {
        options.onSampleFailed?.(error instanceof Error ? error.message : String(error));
      } catch {
        /* 诊断 observer 不能影响执行或失败预算。 */
      }
      return undefined;
    } finally {
      clearTimeout(handle);
    }
  }

  return {
    treeScope: platform === "win32" ? "direct_process" : "process_tree",
    reset() {
      failures = 0;
    },
    async sampleProcessTrees(rootPids) {
      const requested = rootPids.filter(isSamplablePid);
      if (!requested.length) return new Map();
      return sample(async (isExpired) => {
        if (platform === "linux") return sampleLinuxProcessTrees(procReaders(isExpired), requested);
        if (platform === "win32")
          return new Map(
            (await readWindowsProcessMemory(executor, requested)).map((row) => [row.pid, [row]]),
          );
        return groupProcessTrees(await readDarwinProcessTable(executor), requested);
      });
    },
    async sampleProcessGroup(processGroupId) {
      if (platform === "win32" || !isSamplablePid(processGroupId)) return undefined;
      return sample(async (isExpired) =>
        platform === "linux"
          ? sampleLinuxProcessGroup(procReaders(isExpired), processGroupId)
          : (await readDarwinProcessGroup(executor, processGroupId)).map(toSample),
      );
    },
  };
}
