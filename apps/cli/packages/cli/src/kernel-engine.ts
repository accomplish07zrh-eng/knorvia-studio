// SPDX-License-Identifier: Apache-2.0
// CLI 侧引擎选择：只依赖无 DSH 的 kernel-engine 子路径，保证旧路径零加载。

export { resolveKernelEngine } from "@knorvia/bootstrap/kernel-engine";
