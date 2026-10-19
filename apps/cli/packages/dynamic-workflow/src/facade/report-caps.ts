// SPDX-License-Identifier: Apache-2.0

// Knorvia 动态工作流：运行期报告发布（report）配额上限

export const REPORT_CAPS = {
  maxItemsPerRun: 256,
  maxItemSerializedBytes: 32768,
} as const;
