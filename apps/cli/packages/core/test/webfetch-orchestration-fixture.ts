// Source-exposed synthetic fixture/assertion patterns; no licence determination.
import { readFile } from "node:fs/promises";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { createHttpClientError } from "@knorvia/contracts";
import { gate } from "./tool-invocation-fixture.js";
import { URL_FIXTURE, type FetchCase } from "./webfetch-orchestration-cases.js";
export const emitted = process.env.KNORVIA_WEBFETCH_ORCHESTRATION_TEST_EMITTED === "1";
export async function load(path: string) {
  const url = new URL(
    `../${emitted ? "dist" : "src"}/${path}.${emitted ? "js" : "ts"}`,
    import.meta.url,
  );
  if (emitted) await readFile(url);
  return import(url.href);
}
export const handlerModule = await load("tool/handlers/webfetch");
export const entry = handlerModule.webFetchToolEntry;
export const cache = await load("tool/handlers/webfetch-cache");
export const lower = await Promise.all(
  ["url", "egress-guard", "network", "processing", "content", "constants", "trace", "errors"].map(
    (name) => load(`tool/handlers/webfetch-${name}`),
  ),
);
export const publicDeclaration = await readFile(
  new URL("../dist/tool/handlers/webfetch.d.ts", import.meta.url),
  "utf8",
);
export const json = (value: any) =>
  JSON.parse(JSON.stringify(value, (key, item) => (key === "stack" ? undefined : item)));
export function errorShape(error: any): any {
  if (!(error instanceof Error)) return { thrown: json(error) };
  return json({
    name: error.name,
    message: error.message,
    type: error.type,
    code: error.code,
    context: error.context,
    recoverable: error.recoverable,
    retryable: error.retryable,
    issues: error.issues,
    cause: error.cause === undefined ? undefined : errorShape(error.cause),
  });
}
export function declaration() {
  return json(
    Object.fromEntries(
      Object.entries(entry).filter(
        ([, v]) => typeof v !== "function" && typeof (v as any)?.parse !== "function",
      ),
    ),
  );
}
const forbidden = () => {
  throw new Error("Owned WebFetch fixture forbids native fetch/DNS");
};
globalThis.fetch = forbidden as any;
dns.lookup = forbidden as any;
dns.resolve = forbidden as any;
dnsPromises.lookup = forbidden as any;
dnsPromises.resolve = forbidden as any;
export const clockEvents: any[] = [];
let now = 1770091506000;
export function advance(ms: number) {
  now += ms;
}
export async function flushUntil(predicate: () => boolean) {
  for (let i = 0; i < 128 && !predicate(); i++) await Promise.resolve();
  if (!predicate()) throw new Error("Synthetic manual port boundary not reached");
}
export async function clock<T>(run: () => Promise<T>): Promise<T> {
  const NativeDate = globalThis.Date,
    uuid = crypto.randomUUID;
  let ids = 0;
  now = 1770091506000;
  clockEvents.length = 0;
  class FakeDate extends NativeDate {
    constructor(value?: any) {
      super(value === undefined ? now++ : value);
      if (value === undefined) clockEvents.push("date");
    }
    static now() {
      clockEvents.push("now");
      return now++;
    }
  }
  globalThis.Date = FakeDate as DateConstructor;
  crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}` as any;
  try {
    return await run();
  } finally {
    globalThis.Date = NativeDate;
    crypto.randomUUID = uuid;
  }
}
export function fixture(
  c: FetchCase = { label: "default" },
  probe?: { target: string; throwAt: number },
) {
  const controller = new AbortController(),
    calls: any[] = [],
    rawCalls: any[] = [],
    reads: string[] = [];
  const originalError = new Error("Synthetic owned port failure");
  const waits = { request: gate<any>(), generateText: gate<any>() };
  const input =
    c.input === undefined
      ? { url: c.url ?? URL_FIXTURE, prompt: "Summarize owned synthetic content" }
      : c.input;
  let probeReads = 0,
    requestCount = 0;
  const watch = (obj: any, prefix: string) =>
    new Proxy(obj, {
      get(target, key, receiver) {
        const name = `${prefix}.${String(key)}`;
        if (typeof key === "string" && !["then", "toJSON"].includes(key)) reads.push(name);
        if (probe?.target === name && ++probeReads === probe.throwAt) throw originalError;
        return Reflect.get(target, key, receiver);
      },
    });
  function fault(target: string): any {
    if (c.fault?.target !== target) return undefined;
    const { kind } = c.fault;
    if (kind === "throw") throw originalError;
    if (kind === "reject") return Promise.reject(originalError);
    if (kind === "string") return Promise.reject("synthetic non-Error failure");
    if (kind === "null") return Promise.resolve(null);
    if (kind === "undefined") return Promise.resolve(undefined);
    if (kind === "object") return Promise.resolve({ text: {} });
    if (kind === "delay") return waits[target as keyof typeof waits].promise;
    if (["too_large", "egress_blocked", "network_error"].includes(kind))
      return Promise.reject(
        createHttpClientError({
          code: kind as any,
          message:
            kind === "egress_blocked"
              ? "synthetic resolved to non-public address"
              : "Synthetic HTTP refusal",
          url: URL_FIXTURE,
          status: 403,
        }),
      );
  }
  function record(target: string, receiver: any, expected: any, args: any[]) {
    rawCalls.push({ target, args });
    calls.push(
      json({
        target,
        receiver: receiver === expected,
        argc: args.length,
        keys: args[0] && Object.keys(args[0]),
        request: args[0],
        optionKeys: args[1] && Object.keys(args[1]),
        signal: args[1]?.signal === controller.signal || args[0]?.abortSignal === controller.signal,
      }),
    );
  }
  const response = (url = URL_FIXTURE, override: any = {}) => {
    const body = new TextEncoder().encode(override.body ?? c.body ?? "synthetic fetched content");
    return watch(
      {
        url,
        status: c.status ?? 200,
        statusText: c.statusText === undefined ? "OK" : c.statusText,
        headers: c.headers ?? { "content-type": "text/plain" },
        body,
        bytes: body.byteLength,
        durationMs: 7,
        ...override,
        ...(typeof override.body === "string" ? { body } : {}),
      },
      "response",
    );
  };
  const http = watch(
    {
      request: function (...args: any[]) {
        record("request", this, http, args);
        const f = fault("request");
        return f === undefined
          ? Promise.resolve(response(args[0].url, c.responses?.[requestCount++] ?? {}))
          : f;
      },
    },
    "http",
  );
  const model = watch(
    {
      optionSpecs: {
        reasoningLevel: { values: ["synthetic-low", "synthetic-high"] },
        maxOutputTokens: { max: 8192 },
      },
      generateText: function (...args: any[]) {
        record("generateText", this, model, args);
        const f = fault("generateText");
        return f === undefined
          ? Promise.resolve({
              text: c.modelText === undefined ? "  synthetic processed result  " : c.modelText,
            })
          : f;
      },
    },
    "model",
  );
  const artifact = {
    writeToolResultArtifact: function (...args: any[]) {
      record("artifact", this, artifact, args);
      const f = fault("artifact");
      return f === undefined
        ? Promise.resolve({
            path: "synthetic-artifact-path",
            uri: "artifact://owned-webfetch-fixture",
          })
        : f;
    },
  };
  const base: any = {
    toolCallId: "synthetic-call",
    traceId: "synthetic-trace",
    spanId: "synthetic-span",
    parentSpanId: "synthetic-parent",
    sessionId: "synthetic-session",
    turnId: "synthetic-turn",
    abortSignal: controller.signal,
    workingDirectory: ".",
    workspaceRoot: ".",
    httpClientPort: c.noHttp ? undefined : http,
    model: c.noModel ? undefined : model,
    artifactStore: c.artifact ? artifact : undefined,
    emitEvent: function (...args: any[]) {
      record("event", this, context, args);
      return fault("event") ?? Promise.resolve();
    },
  };
  if (c.fault?.kind === "missing") {
    if (c.fault.target === "request") delete (http as any).request;
    if (c.fault.target === "generateText") delete (model as any).generateText;
    if (c.fault.target === "event") delete base.emitEvent;
  }
  const context = watch(base, "context");
  if (c.seed) cache.putWebFetchCache(input.url, c.seed);
  return {
    input,
    context,
    base,
    http,
    model,
    artifact,
    response,
    calls,
    rawCalls,
    reads,
    controller,
    originalError,
    waits,
  };
}
export async function observe(c: FetchCase, probe?: { target: string; throwAt: number }) {
  return clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const f = fixture(c, probe),
      outcomes: any[] = [];
    for (let i = 0; i < (c.repeat ?? 1); i++) {
      if (i) advance(c.advance ?? 0);
      try {
        const output = await entry.handler(f.input, f.context);
        outcomes.push({
          output,
          modelContent: entry.formatModelContent(output),
          ownKeys: Object.keys(output),
        });
      } catch (error) {
        outcomes.push({ error: errorShape(error), originalIdentity: error === f.originalError });
      }
    }
    return json({ outcomes, calls: f.calls, reads: f.reads, clock: clockEvents.slice() });
  });
}
export async function microtaskObservation(hit: boolean) {
  return clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const f = fixture({ label: "microtasks" }),
      timeline: any[] = [];
    if (hit)
      cache.putWebFetchCache(f.input.url, {
        bytes: 1,
        content: "synthetic",
        contentType: "text/plain",
        finalUrl: f.input.url,
        redirects: [],
        sizeBytes: 9,
        status: 200,
        statusText: "OK",
      });
    let tick = 0,
      done = false;
    for (const [owner, field] of [
      [f.http, "request"],
      [f.model, "generateText"],
    ] as const) {
      const original = owner[field];
      owner[field] = function (...args: any[]) {
        timeline.push([field, tick]);
        return original.apply(this, args);
      };
    }
    const pending = entry.handler(f.input, f.context);
    void pending.then(() => {
      done = true;
      timeline.push(["complete", tick]);
    });
    for (; tick < 128 && !done; tick++) await Promise.resolve();
    if (!done) throw new Error("Synthetic settled-port continuation exceeded observation bound");
    await pending;
    return { hit, timeline };
  });
}
