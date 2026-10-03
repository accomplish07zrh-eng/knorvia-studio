import { z } from "zod";
import { decodeKnorviaBuiltinRelease, type KnorviaBuiltinRelease } from "./builtin-release.js";
export interface KnorviaBuiltinDownloadOptions {
  readonly endpointOrigin: string;
  readonly appVersion: string;
  readonly platform: string;
  readonly request: (url: string | URL, init: RequestInit) => Promise<Response>;
  readonly signal?: AbortSignal;
}
class BoundaryFailure extends Error {}
const clientEnvelope = z
  .object({
    code: z.literal(0),
    data: z
      .object({
        configs: z
          .object({
            builtin_provider_config_json: z
              .string()
              .url()
              .refine((value) => {
                const url = new URL(value);
                return url.protocol === "https:" && !url.username && !url.password;
              })
              .optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
function waiting<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function ensureLive(signal: AbortSignal): void {
  signal.throwIfAborted();
}
async function jsonFrom(
  options: KnorviaBuiltinDownloadOptions,
  url: URL,
  signal: AbortSignal,
): Promise<unknown> {
  ensureLive(signal);
  const pending = options
    .request(url, { method: "GET", signal, credentials: "omit", redirect: "error" })
    .then((response) => {
      if (signal.aborted) {
        void response.body?.cancel().catch(() => {});
        signal.throwIfAborted();
      }
      return response;
    });
  const response = await waiting(pending, signal);
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new BoundaryFailure(`HTTP ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new BoundaryFailure("empty body");
  const decoder = new TextDecoder();
  const pieces: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await waiting(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 10000000) throw new BoundaryFailure("body limit exceeded");
      pieces.push(decoder.decode(value, { stream: true }));
    }
    pieces.push(decoder.decode());
    ensureLive(signal);
    return JSON.parse(pieces.join(""));
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
export async function downloadKnorviaBuiltinRelease(
  options: KnorviaBuiltinDownloadOptions,
): Promise<KnorviaBuiltinRelease | null> {
  const timeout = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeout.abort();
  }, 20000);
  timer.unref?.();
  const signal = options.signal
    ? AbortSignal.any([timeout.signal, options.signal])
    : timeout.signal;
  let stage = "client-config";
  try {
    const url = new URL("/api/v1/client/configs", options.endpointOrigin);
    url.searchParams.set("app_version", options.appVersion);
    url.searchParams.set("platform", options.platform);
    const config = clientEnvelope.parse(await jsonFrom(options, url, signal));
    const cdn = config.data.configs.builtin_provider_config_json;
    if (cdn === undefined) return null;
    stage = "cdn";
    return decodeKnorviaBuiltinRelease(await jsonFrom(options, new URL(cdn), signal));
  } catch (error) {
    const reason = signal.aborted
      ? timedOut
        ? "timeout"
        : "cancelled"
      : error instanceof BoundaryFailure
        ? error.message
        : error instanceof z.ZodError
          ? `invalid schema at ${error.issues[0]?.path.join(".") || "root"} (${error.issues[0]?.code})`
          : "invalid response";
    throw new Error(`Knorvia Studio Built-in ${stage}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}
