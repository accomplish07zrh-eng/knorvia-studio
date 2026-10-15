// SPDX-License-Identifier: Apache-2.0
// 模型错误与流式错误归一的兼容面（B28）：实现见 ./model/failure-classification.js 与
// ./model/suspicious-response.js。
import * as classification from "./model/failure-classification.js";
import * as suspicious from "./model/suspicious-response.js";

export const readRawFinishReason = classification.readRawFinishReason;
export const isContextExceededFinishReason = classification.isContextExceededFinishReason;
export const createModelContextExceededFinishError =
  classification.createModelContextExceededFinishError;
export const createCompactRapidRefillError = classification.createCompactRapidRefillError;
export const isSuspiciousEmptyModelResult = suspicious.isSuspiciousEmptyModelResult;
export const buildSuspiciousEmptyDiagnostics = suspicious.buildSuspiciousEmptyDiagnostics;
export const finalizeSuspiciousEmptyModelResult = suspicious.finalizeSuspiciousEmptyModelResult;
export const normalizeStreamError = classification.normalizeStreamError;
export const isModelContextExceededError = classification.isModelContextExceededError;
export const isModelMediaTooLargeError = classification.isModelMediaTooLargeError;
