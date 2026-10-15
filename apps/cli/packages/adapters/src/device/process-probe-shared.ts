// SPDX-License-Identifier: Apache-2.0
// 兼容外壳：进程探测共享层的公开导出，实现分布在 probe-types / probe-tree / probe-command。
export {
  PROCESS_PROBE_SAMPLE_TIMEOUT_MS,
  ProcessProbeFailure,
  isSamplablePid,
  toSample,
  type ProcessProbeCommandResult,
  type ProcessProbeExecFile,
  type ProcessProbeSample,
  type ProcessRelation,
  type ProcessRow,
} from "./probe-types.js";
export { collectProcessTreePids, groupProcessTrees } from "./probe-tree.js";
export { defaultProbeExecFile, runProbeCommand } from "./probe-command.js";
