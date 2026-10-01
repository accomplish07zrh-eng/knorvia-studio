// Source-exposed orchestration; public prose, policy and attribution remain applicable.
import { WebFetchInputSchema, type WebFetchInput, type WebFetchOutput } from "@knorvia/contracts";
import type { ToolExecutionContext, ToolHandler } from "../types.js";
import { isWebFetchPreapprovedUrl } from "../webfetch-preapproved.js";
import { getWebFetchCache, putWebFetchCache } from "./webfetch-cache.js";
import { fetchAndExtractContent } from "./webfetch-network.js";
import { processFetchedContent } from "./webfetch-processing.js";
import type {
  CachedFetchContent,
  HttpErrorFetchContent,
  RedirectFetchContent,
} from "./webfetch-types.js";
import { normalizeWebFetchUrl } from "./webfetch-url.js";

interface OutcomeProjection {
  terminal(
    input: WebFetchInput,
    fetched: HttpErrorFetchContent | RedirectFetchContent,
    durationMs: number,
  ): WebFetchOutput;
  statusText(status: number, statusText: string): string;
}
interface NormalResult {
  input: WebFetchInput;
  fetched: CachedFetchContent;
  processing: Awaited<ReturnType<typeof processFetchedContent>>;
  durationMs: number;
  cacheHit: boolean;
  projection: OutcomeProjection;
}
// Lazy field readers preserve the public insertion order and repeated status reads.
const NORMAL_FIELDS = {
  url: (frame: NormalResult) => frame.input.url,
  finalUrl: (frame: NormalResult) => frame.fetched.finalUrl,
  status: (frame: NormalResult) => frame.fetched.status,
  statusText: (frame: NormalResult) =>
    frame.projection.statusText(frame.fetched.status, frame.fetched.statusText),
  contentType: (frame: NormalResult) => frame.fetched.contentType,
  bytes: (frame: NormalResult) => frame.fetched.bytes,
  durationMs: (frame: NormalResult) => frame.durationMs,
  result: (frame: NormalResult) => frame.processing.result,
  cacheHit: (frame: NormalResult) => frame.cacheHit,
  redirects: (frame: NormalResult) => frame.fetched.redirects,
  artifactUri: (frame: NormalResult) => frame.fetched.artifactUri,
  artifactPath: (frame: NormalResult) => frame.fetched.artifactPath,
  truncated: (frame: NormalResult) => frame.processing.truncated,
} satisfies Record<keyof WebFetchOutput, (frame: NormalResult) => unknown>;
const FRESH_FIELDS = ["context", "originalUrl", "url"] as const;
type FreshRequest = Parameters<typeof fetchAndExtractContent>[0];

function retrieveFresh(frame: FreshRequest) {
  const request = Object.fromEntries(FRESH_FIELDS.map((key) => [key, frame[key]])) as FreshRequest;
  // 保留旧 fresh await 后的 continuation；cache hit 不经过此异步边界。
  return fetchAndExtractContent(request).then((fetched) => ({
    fetched,
    preapprovedUrl: isWebFetchPreapprovedUrl(frame.originalUrl),
  }));
}

export function createWebFetchOperation(projection: OutcomeProjection): ToolHandler {
  // 直接绑定此唯一 async owner，避免入口 forwarding wrapper 增加 promise adoption。
  return async (input, context: ToolExecutionContext) => {
    const parsed = WebFetchInputSchema.parse(input) as WebFetchInput;
    const startedAt = Date.now();
    const normalizedUrl = normalizeWebFetchUrl(parsed.url);
    const cacheKey = parsed.url;
    const cached = getWebFetchCache(cacheKey);
    let material;
    if (cached === undefined) {
      material = await retrieveFresh({ context, originalUrl: cacheKey, url: normalizedUrl });
    } else {
      material = { fetched: cached, preapprovedUrl: isWebFetchPreapprovedUrl(parsed.url) };
    }
    const fetched = material.fetched;
    if ("type" in fetched) {
      return projection.terminal(parsed, fetched, Math.max(0, Date.now() - startedAt));
    }
    if (cached === undefined) putWebFetchCache(cacheKey, fetched);
    const processing = await processFetchedContent(parsed, fetched, context, {
      preapprovedUrl: material.preapprovedUrl,
    });
    const durationMs = Math.max(0, Date.now() - startedAt);
    const result: NormalResult = {
      input: parsed,
      fetched,
      processing,
      durationMs,
      cacheHit: cached !== undefined,
      projection,
    };
    return Object.fromEntries(
      Object.entries(NORMAL_FIELDS).map(([key, read]) => [key, read(result)]),
    ) as unknown as WebFetchOutput;
  };
}
