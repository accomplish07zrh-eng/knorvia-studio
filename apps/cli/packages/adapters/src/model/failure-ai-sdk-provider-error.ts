// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import { ProviderBusinessError, readProviderBusinessFailureFromBody } from "./model-execution.js";
import {
  getApiCallErrorData,
  getApiCallResponseBody,
  getResponseHeaders,
  getStatusCode,
} from "./failure-inspection.js";
export function readMappedAiSdkProviderBusinessError(
  error: unknown,
): ProviderBusinessError | undefined {
  const failure = readProviderBusinessFailureFromBody(
    getApiCallErrorData(error) ?? getApiCallResponseBody(error),
  );
  if (!failure) return undefined;
  return new ProviderBusinessError({
    ...failure,
    providerCode: failure.providerCode === undefined ? undefined : String(failure.providerCode),
    providerId: "unknown",
    providerKind: "openai-compatible",
    responseHeaders: getResponseHeaders(error),
    responseStatus: getStatusCode(error),
    statusCode: failure.statusCode ?? getStatusCode(error),
  });
}
