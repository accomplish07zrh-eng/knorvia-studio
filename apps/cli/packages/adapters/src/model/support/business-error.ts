// SPDX-License-Identifier: Apache-2.0
// provider 业务错误内核：错误类（duck-typing 可识别）、响应体业务失败提取（探针表 + 截断 + 摘要）
// 与非 2xx 响应的业务错误化 fetch。文案与摘要形状由 B4–B6 锁定，逐字保持。

import { isRecord } from "../runner-record.js";
import { createNetworkProxyFetch } from "../../network/proxy-fetch.js";
import type {
  ProviderBusinessErrorFetchOptions,
  ProviderBusinessErrorOptions,
  ProviderCode,
  AiSdkProviderKind,
} from "./execution-contract.js";

type WireTransport = typeof globalThis.fetch;
const BUSINESS_ERROR_NAME = "ProviderBusinessError";
const BUSINESS_ERROR_CODE = "PROVIDER_BUSINESS_ERROR";
const FALLBACK_MESSAGE = (providerId: string) => `Provider ${providerId} rejected the request`;

export class ProviderBusinessError extends Error {
  readonly code = BUSINESS_ERROR_CODE; // 识别码（协议面）
  readonly isProviderBusinessError = true; // duck-typing 标记
  readonly providerCode?: ProviderCode; // provider 业务码
  readonly providerId!: string; // provider 身份
  readonly providerKind!: AiSdkProviderKind; // SDK 种类
  readonly providerMessage?: string; // provider 消息
  readonly providerRequestId?: string; // provider 请求 id
  readonly responseBodySummary?: Record<string, unknown>; // 体摘要（前 20 原语条目）
  readonly responseHeaders?: Record<string, string>; // 响应头全量
  readonly responseStatus?: number; // 响应状态
  readonly statusCode?: number; // HTTP 状态（体优先）

  constructor(details: ProviderBusinessErrorOptions) {
    super(details.providerMessage ?? FALLBACK_MESSAGE(details.providerId));
    this.name = BUSINESS_ERROR_NAME;
    const fields = Object.entries(details);
    for (const [key, value] of fields) {
      (this as unknown as Record<string, unknown>)[key] = value; // 逐字段装配（同 Object.assign 语义）
    }
  }
}

function duckTyped(error: unknown): boolean {
  return isRecord(error) && error.isProviderBusinessError === true;
}

export function isProviderBusinessError(error: unknown): error is ProviderBusinessError {
  return error instanceof ProviderBusinessError || duckTyped(error);
}

const MAX_BODY_SCAN = 64_000; // 体解析上限（超出即放弃提取）
const MAX_MESSAGE = 1000; // 消息截断长度
const SUMMARY_LIMIT = 20; // 摘要条目上限

// 字段探针表：按「子袋优先、顶层次之」的顺序取业务码/消息/请求 id
const FIELD_PROBES = [
  { slot: "providerCode", keys: ["providerCode", "error_code", "code"] },
  { slot: "providerMessage", keys: ["message", "error"] },
  { slot: "providerRequestId", keys: ["request_id", "requestId", "id"] },
] as const;

export interface ProviderFailureExtraction {
  providerCode?: ProviderCode; // provider 业务码
  providerMessage?: string; // provider 消息（≤1000）
  providerRequestId?: string; // provider 请求 id（≤1000）
  responseBodySummary?: Record<string, unknown>; // 体摘要
  statusCode?: number; // 体携带的 HTTP 状态
}

function truncated(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, MAX_MESSAGE) : undefined;
}

function pickField(source: Record<string, unknown>, candidates: readonly string[]): unknown {
  for (const name of candidates) {
    const value = source[name];
    if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
      return value;
    }
  }
  return undefined; // 候选全空
}

function summarize(record: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(record)) {
    const primitive = value === null || ["string", "number", "boolean"].includes(typeof value);
    if (!primitive || kept >= SUMMARY_LIMIT) continue;
    summary[key] = value;
    kept += 1;
  }
  return summary;
}

function extractFromRecord(
  top: Record<string, unknown>,
  nested: Record<string, unknown> | undefined,
): ProviderFailureExtraction {
  const extraction: ProviderFailureExtraction = {};
  for (const probe of FIELD_PROBES) {
    const picked = pickField(nested ?? {}, probe.keys) ?? pickField(top, probe.keys);
    if (picked === undefined) continue;
    const shaped = probe.slot === "providerCode" ? picked : truncated(picked);
    if (shaped !== undefined) {
      (extraction as unknown as Record<string, unknown>)[probe.slot] = shaped;
    }
  }
  const status = typeof top.status === "number" ? top.status : nested?.status;
  if (typeof status === "number") extraction.statusCode = status;
  const summary = summarize(top);
  if (nested) summary.error = summarize(nested);
  extraction.responseBodySummary = summary;
  return extraction;
}

function decodeBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return undefined; // 非法 JSON 无从提取
  }
}

export function readProviderBusinessFailureFromBody(
  body: unknown,
): ProviderFailureExtraction | undefined {
  if (typeof body === "string" && body.length > MAX_BODY_SCAN) return undefined; // 超长体放弃
  const decoded = decodeBody(body);
  const top =
    isRecord(decoded) && !Array.isArray(decoded) ? (decoded as Record<string, unknown>) : undefined;
  if (!top) return undefined;
  const errorBag = isRecord(top.error) ? (top.error as Record<string, unknown>) : undefined;
  const extraction = extractFromRecord(top, errorBag);
  const meaningful =
    extraction.providerCode !== undefined ||
    extraction.providerMessage !== undefined ||
    extraction.providerRequestId !== undefined;
  return meaningful ? extraction : undefined;
}

function collectHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function businessErrorFrom(
  failure: ProviderFailureExtraction,
  response: Response,
  wiring: ProviderBusinessErrorFetchOptions,
): ProviderBusinessError {
  return new ProviderBusinessError({
    ...failure, // 提取出的业务码/消息/请求 id
    providerId: wiring.providerId, // 请求身份
    providerKind: wiring.providerKind,
    responseHeaders: collectHeaders(response),
    responseStatus: response.status,
    statusCode: failure.statusCode ?? response.status,
  });
}

export function createProviderBusinessErrorFetch(
  wiring: ProviderBusinessErrorFetchOptions,
): WireTransport {
  const transport = wiring.fetch ?? globalThis.fetch;
  const wire = createNetworkProxyFetch({
    caCertFile: wiring.caCertFile,
    env: wiring.env,
    httpProxy: wiring.httpProxy,
    noProxy: wiring.noProxy,
    fetch: transport,
  });
  return async (resource, init) => {
    const response = await wire(resource, init);
    if (response.ok) return response;
    const failure = readProviderBusinessFailureFromBody(await response.clone().text());
    if (!failure) return response;
    response.body?.cancel().catch(() => undefined); // 尽力清理，不覆盖原始错误
    throw businessErrorFrom(failure, response, wiring);
  };
}
