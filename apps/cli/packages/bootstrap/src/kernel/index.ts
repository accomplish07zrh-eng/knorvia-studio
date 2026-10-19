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
