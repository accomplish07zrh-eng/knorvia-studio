// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type {
  ModelErrorCode as ModelErrorCodeType,
  ModelFailureReason,
  ModelRetryReason,
} from "@knorvia/contracts";
import type { ProviderBusinessError } from "./model-execution.js";
interface ProviderBusinessCodeMapping {
  code: ModelErrorCodeType;
  message?: string;
  reason: ModelFailureReason;
  retryReason: ModelRetryReason;
  retryable: boolean;
}
const map = new Map<string, ProviderBusinessCodeMapping>();
const add = (codes: string[], value: ProviderBusinessCodeMapping) =>
  codes.forEach((code) => map.set(code, value));
const retryServer = {
  code: "model_request_failed",
  reason: "server_error",
  retryReason: "server_error",
  retryable: true,
} as ProviderBusinessCodeMapping;
add(["500", "1120", "1230", "2007"], retryServer);
add(["1234"], {
  code: "model_request_failed",
  reason: "network_error",
  retryReason: "network_error",
  retryable: true,
});
add(["1312", "engine_overloaded_error", "overloaded_error"], {
  code: "model_request_failed",
  reason: "provider_overloaded",
  retryReason: "provider_overloaded",
  retryable: true,
});
add(["1302", "1303", "1305", "3002", "rate_limit_reached_error", "rate_limit_error"], {
  code: "model_rate_limited",
  reason: "rate_limited",
  retryReason: "rate_limited",
  retryable: true,
});
add(
  [
    "3008",
    "3009",
    "3010",
    "1304",
    "1308",
    "1310",
    "1313",
    "insufficient_quota",
    "credit_balance_exhausted",
    "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded",
    "organization_usage_limit_exceeded",
    "exceeded_current_quota_error",
    "2056",
    "20097",
    "1316",
    "1317",
    "1318",
    "1319",
    "1320",
    "1321",
  ],
  {
    code: "model_rate_limited",
    reason: "rate_limited",
    retryReason: "rate_limited",
    retryable: false,
  },
);
add(["1006"], {
  code: "provider_not_configured",
  reason: "auth_failed",
  retryReason: "auth_refresh",
  retryable: false,
});
add(["3007"], {
  code: "invalid_model_request",
  reason: "auth_failed",
  retryReason: "auth_refresh",
  retryable: false,
});
add(["3006"], {
  code: "model_not_found",
  reason: "invalid_request",
  retryReason: "network_error",
  retryable: false,
});
add(["3001"], {
  code: "invalid_model_request",
  reason: "invalid_request",
  retryReason: "network_error",
  retryable: false,
});
add(["1261"], {
  code: "model_context_exceeded",
  reason: "context_exceeded",
  retryReason: "network_error",
  retryable: false,
});
add(["1005"], {
  code: "model_request_failed",
  reason: "invalid_request",
  retryReason: "network_error",
  retryable: false,
});
add(["1113", "1309", "1311", "1008", "1314", "1315"], {
  code: "model_request_failed",
  reason: "unknown",
  retryReason: "network_error",
  retryable: false,
});
export function getProviderBusinessCodeMapping(
  providerCode: string,
): ProviderBusinessCodeMapping | undefined {
  return map.get(providerCode);
}
export function isRetryableProviderBusinessNetworkFailure(
  error: ProviderBusinessError,
  providerCode: string | undefined,
): boolean {
  if (providerCode && getProviderBusinessCodeMapping(providerCode)) return false;
  const text = `${error.providerMessage ?? ""} ${error.message}`;
  return /internal network|connection reset|socket hang up/i.test(text);
}
export function isRetryableProviderBusinessTimeoutFailure(
  error: ProviderBusinessError,
  providerCode: string | undefined,
  statusCode?: number,
): boolean {
  if (providerCode && getProviderBusinessCodeMapping(providerCode)) return false;
  return (
    statusCode === 408 ||
    statusCode === 504 ||
    /timed?\s*out/i.test(`${error.providerMessage ?? ""} ${error.message}`)
  );
}
