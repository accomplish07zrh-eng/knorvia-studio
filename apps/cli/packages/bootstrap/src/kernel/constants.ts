// SPDX-License-Identifier: Apache-2.0
// 新运行时对进程与用户可见的固定字符串；任何改动都属于合同升级。

export const KERNEL_DSH_VERSION = "0.2.0-rc.2";

export const KERNEL_READY_MARKER = "knorvia-kernel-ready";
export const KERNEL_FAILED_MARKER = "knorvia-kernel-failed";

export const KERNEL_PERSONA_PREFIX =
  "你是 Knorvia，Knorvia Studio 的内置助手。被问到实现时，如实说明基于开源的 DeepSeek Harness；被问到模型时，如实说明是用户配置的模型，不冒充其他模型。";
