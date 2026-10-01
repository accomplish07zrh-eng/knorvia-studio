// Appended after the first full checkpoint; archived reference is retained exposed source.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { invocation } from "./tool-invocation-fixture.js";
import { cachedContent, URL_FIXTURE } from "./webfetch-orchestration-cases.js";
import {
  cache,
  clock,
  clockEvents,
  emitted,
  errorShape,
  handlerModule,
  json,
  load,
} from "./webfetch-orchestration-fixture.js";
import { createToolRegistry, executeToolCall } from "./webfetch-orchestration-consumer-fixture.js";
export const archive = JSON.parse(
  await readFile(
    new URL("./webfetch-orchestration-settlement-baseline.json", import.meta.url),
    "utf8",
  ),
);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(archive.source), archive.sourceSha256);
assert.equal(sha(archive.compiled), archive.compiledSha256);
assert.equal(
  archive.sourceSha256,
  "b92f6bdc5aadcd332976eb301de728a32149aeab13c89a0b77bec7481d936866",
);
const mapped = archive.compiled.replace(/from "([^"]+)"/gu, (_match: string, specifier: string) => {
  const resolved = specifier.startsWith(".")
    ? new URL(
        specifier.replace(/\.js$/u, emitted ? ".js" : ".ts"),
        new URL(
          `../${emitted ? "dist" : "src"}/tool/handlers/webfetch.${emitted ? "js" : "ts"}`,
          import.meta.url,
        ),
      ).href
    : specifier.startsWith("node:")
      ? specifier
      : import.meta.resolve(specifier);
  return `from ${JSON.stringify(resolved)}`;
});
// Only module import locations differ; handler/policy/prose expressions are the archived baseline.
export const baseline = (
  await import(`data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`)
).webFetchToolEntry;
export const { ToolDeadline, executeWithTimeout, linkAbortSignal } =
  await load("tool/executor/timeout");
export type Path = "fresh" | "cached" | "redirect" | "http-error";
export const paths: Path[] = ["fresh", "cached", "redirect", "http-error"];
const stages: Record<Path, string[]> = {
  fresh: ["network.complete", "cache.commit", "model.complete", "result.complete"],
  cached: ["cache.commit", "model.complete", "result.complete"],
  redirect: ["network.complete", "result.complete"],
  "http-error": ["network.complete", "result.complete"],
};
export const edgeCases = paths.flatMap((path) =>
  stages[path].flatMap((stage) =>
    Array.from({ length: 7 }, (_, depth) => ({ path, stage, depth })),
  ),
);
export async function settlement(
  selected: any,
  driver: "deadline" | "executor",
  path: Path,
  stage = "none",
  depth = 0,
  early = false,
) {
  return clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const external = new AbortController(),
      effects: any[] = [],
      network: any[] = [],
      contexts: any[] = [];
    let fired = false;
    function edge(name: string) {
      effects.push({ edge: name });
      if (name !== stage || fired) return;
      fired = true;
      const queue = (remaining: number) =>
        remaining === 0
          ? external.abort("Synthetic completion-edge abort")
          : queueMicrotask(() => queue(remaining - 1));
      queue(depth);
    }
    const statusText = {
      trim() {
        edge("result.complete");
        return "Synthetic Status";
      },
    };
    const response = {
      url: URL_FIXTURE,
      status: path === "redirect" ? 302 : path === "http-error" ? 403 : 200,
      statusText,
      headers:
        path === "redirect"
          ? { location: "https://other-owned.example/target" }
          : { "content-type": "text/plain" },
      body: new TextEncoder().encode("synthetic owned content"),
      bytes: 23,
      durationMs: 7,
    };
    const http = {
      request(request: any, options: any) {
        assert.equal(this, http);
        effects.push({ port: "http", request, signal: options.signal.aborted });
        return response;
      },
    };
    const model = {
      optionSpecs: {
        reasoningLevel: { values: ["synthetic-low"] },
        maxOutputTokens: { max: 8192 },
      },
      generateText(request: any) {
        effects.push({ port: "model", request, signal: request.abortSignal.aborted });
        return {
          get text() {
            edge("model.complete");
            return "synthetic processed result";
          },
        };
      },
    };
    if (path === "cached") cache.putWebFetchCache(URL_FIXTURE, { ...cachedContent, statusText });
    const originalSet = Map.prototype.set;
    Map.prototype.set = function (key, value) {
      const result = originalSet.call(this, key, value);
      if (key === URL_FIXTURE && value && Object.hasOwn(value, "expiresAt")) edge("cache.commit");
      return result;
    };
    const emit = (event: any) => {
      network.push(event);
      if (event.payload?.status === "complete") edge("network.complete");
    };
    const input = { url: URL_FIXTURE, prompt: "synthetic prompt" };
    if (early) external.abort("Synthetic early control");
    try {
      let fact: any,
        telemetry: any[] = [],
        terminalEvents: any[] = [];
      if (driver === "deadline") {
        const controller = new AbortController(),
          unlink = linkAbortSignal(external.signal, controller);
        const context: any = {
          toolCallId: "synthetic-call",
          traceId: "synthetic-trace",
          spanId: "synthetic-span",
          parentSpanId: "synthetic-parent",
          sessionId: "synthetic-session",
          turnId: "synthetic-turn",
          abortSignal: controller.signal,
          workingDirectory: ".",
          workspaceRoot: ".",
          httpClientPort: http,
          model,
          emitEvent: emit,
        };
        contexts.push(context);
        try {
          fact = {
            success: true,
            output: await executeWithTimeout(
              selected.handler,
              input,
              context,
              new ToolDeadline(60000),
              controller,
              selected,
            ),
          };
        } catch (error) {
          fact = { success: false, error: errorShape(error) };
        } finally {
          unlink();
        }
      } else {
        const { handler, ...rest } = selected,
          f = invocation(rest);
        // Observation returns the exact promise, without async forwarding/adoption.
        f.entry.handler = (accepted: any, context: any) => {
          contexts.push(context);
          return handler(accepted, context);
        };
        const registry = createToolRegistry();
        registry.register(f.entry);
        f.deps.registry = registry;
        f.deps.httpClientPort = http as any;
        f.deps.model = model as any;
        f.deps.emitEvent = ((event: any) => {
          f.events.push(event);
          emit(event);
        }) as any;
        f.call.input = input;
        const result = await f.run(
          {
            signal: external.signal,
            traceContext: { traceId: "synthetic-executor-trace", spanId: "synthetic-parent" },
          },
          executeToolCall,
        );
        fact = {
          success: result.success,
          output: result.output,
          error: result.error ? errorShape(result.error) : undefined,
          modelContent: result.modelContent,
          display: result.display,
          serialization: result.serialization,
          readFileStateMetadata: result.readFileStateMetadata,
          skillTelemetryMetadata: result.skillTelemetryMetadata,
          hasReadMetadata: Object.hasOwn(result, "readFileStateMetadata"),
          hasSkillMetadata: Object.hasOwn(result, "skillTelemetryMetadata"),
          turnControl: result.turnControl,
        };
        telemetry = f.terminal().map((t) => ({
          name: t.name,
          args: t.args.map((arg) => (arg instanceof Error ? errorShape(arg) : arg)),
        }));
        terminalEvents = f.events
          .filter((e) => ["tool_call_result", "tool_call_error"].includes(e.type))
          .map((e) => ({ type: e.type, payload: e.payload }));
      }
      // All ports are synchronous; flush existing lower continuations after cancellation.
      await new Promise((resolve) => setImmediate(resolve));
      const spans = contexts.map((ctx) => ctx.spanId);
      const propagation = effects
        .filter((e) => e.port === "http")
        .map((e) => spans.includes(e.request.trace.spanId));
      return JSON.parse(
        JSON.stringify(
          json({
            path,
            stage,
            depth,
            early,
            fired,
            aborted: external.signal.aborted,
            fact,
            telemetry,
            terminalEvents,
            network: network.filter((e) => e.payload?.source === "http_client"),
            effects,
            propagation,
            clock: clockEvents.slice(),
          }),
          (_key, value) => (spans.includes(value) ? "synthetic-generated-span" : value),
        ),
      );
    } finally {
      Map.prototype.set = originalSet;
    }
  });
}
