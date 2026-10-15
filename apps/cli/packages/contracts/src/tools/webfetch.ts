// WebFetch Tool - URL fetch and extraction

// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { ToolCallId, TraceId } from "../interfaces/shared.js";
import { toToolJsonSchema } from "./json-schema.js";

// 输入 schema（冻结面）。

export const WebFetchInputSchema = z.object({
  url: z.string().url().describe("The URL to fetch content from"),
  prompt: z.string().describe("The prompt to run on the fetched content"),
});

export type WebFetchInput = z.infer<typeof WebFetchInputSchema>;

export const WebFetchInputJsonSchema = toToolJsonSchema(WebFetchInputSchema);

// 输出类型与错误码。

export interface WebFetchRedirect {
  from: string;
  to: string;
  status: number;
}

export interface WebFetchOutput {
  url: string;
  finalUrl: string;
  status: number;
  statusText: string;
  contentType: string;
  bytes: number;
  durationMs: number;
  result: string;
  cacheHit: boolean;
  redirects: WebFetchRedirect[];
  artifactUri?: string;
  artifactPath?: string;
  truncated: boolean;
}

export const WebFetchRedirectSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    status: z.number().int().nonnegative(),
  })
  .strict();

export const WebFetchOutputSchema = z
  .object({
    url: z.string(),
    finalUrl: z.string(),
    status: z.number().int().nonnegative(),
    statusText: z.string(),
    contentType: z.string(),
    bytes: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    result: z.string(),
    cacheHit: z.boolean(),
    redirects: z.array(WebFetchRedirectSchema),
    artifactUri: z.string().optional(),
    artifactPath: z.string().optional(),
    truncated: z.boolean(),
  })
  .strict();

export const WebFetchOutputJsonSchema = toToolJsonSchema(WebFetchOutputSchema);

// 工具调用结构：供 handler 与结果投影读取的字段。

export interface WebFetchToolCall {
  id: ToolCallId;
  name: "WebFetch";
  input: WebFetchInput;
  traceId: TraceId;
  startedAt: Date;
}

export interface WebFetchToolResult {
  toolCallId: ToolCallId;
  output: WebFetchOutput;
  traceId: TraceId;
  durationMs: number;
}

// WebFetch 的错误码枚举。

export const WebFetchErrorCode = {
  InvalidUrl: "webfetch_invalid_url",
  UnsupportedProtocol: "webfetch_unsupported_protocol",
  CredentialsInUrl: "webfetch_credentials_in_url",
  MissingRedirectLocation: "webfetch_missing_redirect_location",
  UnsafeRedirect: "webfetch_unsafe_redirect",
  EgressBlocked: "webfetch_egress_blocked",
  TooManyRedirects: "webfetch_too_many_redirects",
  ResponseTooLarge: "webfetch_response_too_large",
  FetchFailed: "webfetch_fetch_failed",
  ProcessingFailed: "webfetch_processing_failed",
} as const;

export type WebFetchErrorCode = (typeof WebFetchErrorCode)[keyof typeof WebFetchErrorCode];
