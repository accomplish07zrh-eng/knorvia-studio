// SPDX-License-Identifier: Apache-2.0
// 图片预算：请求上限归一化、预算判定与请求校验。
import type { ImagePrepareForModelRequest } from "@knorvia/contracts";
import { createImageProcessorError } from "@knorvia/contracts";

interface BudgetLimits {
  tokenToBase64CharRatio: number;
  maxTokens?: number;
  maxRawBytes: number;
  maxBase64Bytes: number;
}

export type ImageBudget = BudgetLimits;

/** 缺省 token 比例：base64 字符数 × 该比例 ≈ token 数。 */
const DEFAULT_TOKEN_RATIO = 0.125;

type Request = ImagePrepareForModelRequest;

/** 三个上限的校验规则：字段名 → 错误消息（逐字固定，调用方按 code 判定）。 */
const POSITIVE_LIMITS: readonly (readonly [keyof Request, string])[] = [
  ["maxDimension", "Image resize maxDimension must be a positive finite number"],
  ["maxBase64Bytes", "Image maxBase64Bytes must be a positive finite number"],
  ["maxRawBytes", "Image maxRawBytes must be a positive finite number"],
];

function base64Characters(byteLength: number): number {
  const groups = Math.ceil(byteLength / 3);
  return groups * 4;
}

export function createImageBudget(input: Request): ImageBudget {
  // `maxTokens` 保持「键存在、值可为 undefined」的形状：调用方按 `undefined` 判定「无 token 预算」。
  const budget = {} as ImageBudget;
  budget.maxBase64Bytes = Math.floor(input.maxBase64Bytes);
  budget.maxRawBytes = Math.floor(input.maxRawBytes);
  budget.maxTokens = input.maxTokens;
  budget.tokenToBase64CharRatio = input.tokenToBase64CharRatio ?? DEFAULT_TOKEN_RATIO;
  return budget;
}

export function validatePrepareRequest(input: Request): void {
  for (const [field, message] of POSITIVE_LIMITS) {
    const value = input[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw createImageProcessorError({ code: "invalid_request", message });
    }
  }
}

/** 依次判定原始字节、base64 长度与（可选的）token 预算；任一项超限即不通过。 */
export function fitsImageBudget(data: Buffer, limits: ImageBudget): boolean {
  if (limits.maxRawBytes < data.byteLength) return false;
  const characters = base64Characters(data.byteLength);
  if (limits.maxBase64Bytes < characters) return false;
  const tokens = limits.maxTokens;
  if (tokens === undefined) return true;
  return Math.ceil(characters * limits.tokenToBase64CharRatio) <= tokens;
}
