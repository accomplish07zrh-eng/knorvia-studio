// SPDX-License-Identifier: Apache-2.0
// @knorvia/bootstrap/kernel 的唯一公开入口；只能在引擎选择为 dsh 时动态加载。

export {
  KERNEL_DSH_VERSION,
  KERNEL_FAILED_MARKER,
  KERNEL_PERSONA_PREFIX,
  KERNEL_READY_MARKER,
} from "./constants.js";
export { KERNEL_PLUGIN_ROWS, createKernelPluginRows, type KernelPluginRow } from "./composition.js";
export { type BootKernelOptions, type KernelHost, bootKernel } from "./host.js";
export { type KernelLogger } from "./logger.js";
export { type RunKernelProcessOptions, runKernelProcess } from "./process.js";
export {
  type KernelUserEnvironmentSnapshot,
  createUserEnvironmentSnapshot,
  materializeSnapshot,
} from "./user-environment.js";
export {
  SnapshotBashExecutor,
  SnapshotPwshExecutor,
  rewriteShellSpecEnvironment,
} from "./shell-environment.js";
export {
  KERNEL_AUTO_COMPACT_THRESHOLD,
  KERNEL_COMPRESSION_CONFIG,
  LEGACY_BUFFER_TOKENS,
  LEGACY_CONTEXT_WINDOW,
  LEGACY_OUTPUT_RESERVE_CEILING,
  LEGACY_OUTPUT_RESERVE_REQUEST,
  type CompressionBudget,
  CompressionWindowError,
  type KernelCompressionConfig,
  dshPressureThreshold,
  legacyAutoCompactThreshold,
  legacyBudgetChain,
  legacyEffectiveWindow,
  minimumUsableWindow,
  pressureThresholdFor,
} from "./compression.js";
export {
  RUNTIME_CONTEXT_NAME,
  apply as applyRuntimeContext,
  currentRuntimeContextInput,
  renderRuntimeContext,
} from "./runtime-context.js";
export { createBuiltinsRows, createMcpRows, type KernelMcpServerLike } from "./builtins-rows.js";
export { kernelPluginModuleIds } from "./builtins-modules.js";
