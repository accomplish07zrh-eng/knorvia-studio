// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import { getErrorCode } from "./failure-inspection.js";
const TLS_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "EPROTO",
]);
export function isTlsFailure(code?: string): boolean {
  return code !== undefined && TLS_CODES.has(code.toUpperCase());
}
export function normalizeModelTlsFailure(error: unknown): unknown {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AiSdkModelAdapterError"
  )
    return error;
  const code = getErrorCode(error);
  if (!isTlsFailure(code)) return error;
  const normalized = new Error("TLS connection validation failed", { cause: error });
  normalized.name = "ModelTlsValidationError";
  Object.assign(normalized, { code: "MODEL_TLS_VALIDATION_FAILED", tlsCode: code });
  return normalized;
}
