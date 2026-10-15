// SPDX-License-Identifier: Apache-2.0
// AI SDK 抛出的 provider 错误兜底映射：从错误链取 data/errorData 或响应体，
// 提取业务失败要素后补成 ProviderBusinessError（providerId 未知、种类归兼容端）。

import { ProviderBusinessError, readProviderBusinessFailureFromBody } from "./model-execution.js";
import {
  getApiCallErrorData,
  getApiCallResponseBody,
  getResponseHeaders,
  getStatusCode,
} from "./failure-inspection.js";

const UNKNOWN_PROVIDER = "unknown";
const FALLBACK_KIND = "openai-compatible" as const;

export function readMappedAiSdkProviderBusinessError(
  candidate: unknown,
): ProviderBusinessError | undefined {
  const payload = getApiCallErrorData(candidate) ?? getApiCallResponseBody(candidate);
  const extraction = readProviderBusinessFailureFromBody(payload);
  if (!extraction) return undefined;
  const httpStatus = getStatusCode(candidate);
  return new ProviderBusinessError({
    ...extraction,
    providerCode:
      extraction.providerCode === undefined ? undefined : String(extraction.providerCode),
    providerId: UNKNOWN_PROVIDER,
    providerKind: FALLBACK_KIND,
    responseHeaders: getResponseHeaders(candidate),
    responseStatus: httpStatus,
    statusCode: extraction.statusCode ?? httpStatus,
  });
}
