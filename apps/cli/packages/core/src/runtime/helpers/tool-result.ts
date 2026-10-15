// SPDX-License-Identifier: Apache-2.0
// 工具结果文本化与错误判定的兼容面（B40）：实现见 ./tooling/tool-result-formatting.js。
import * as formatting from "./tooling/tool-result-formatting.js";

export const emptyTokenUsageInfo = formatting.emptyTokenUsageInfo;
export const toTokenUsageInfo = formatting.toTokenUsageInfo;
export const toRecordInput = formatting.toRecordInput;
export const stringifyToolResultOutput = formatting.stringifyToolResultOutput;
export const modelContentForToolResult = formatting.modelContentForToolResult;
export const isErrorForToolResult = formatting.isErrorForToolResult;
export const stringifyForEstimation = formatting.stringifyForEstimation;
export const parseMcpToolName = formatting.parseMcpToolName;
export const findParallelGroupIndex = formatting.findParallelGroupIndex;
