// SPDX-License-Identifier: Apache-2.0
// 兼容外壳：进程探测工厂的公开导出，实现在同目录的 probe-factory.ts。
export { PROCESS_PROBE_SAMPLE_TIMEOUT_MS } from "./probe-types.js";
export type {
  ProcessProbeCommandResult,
  ProcessProbeExecFile,
  ProcessProbeSample,
} from "./probe-types.js";
export { createProcessProbe, type ProcessProbe, type ProcessTreeScope } from "./probe-factory.js";
