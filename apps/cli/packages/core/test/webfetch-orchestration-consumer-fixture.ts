import { createHash } from "node:crypto";
import { invocation } from "./tool-invocation-fixture.js";
import { URL_FIXTURE, directCases, type FetchCase } from "./webfetch-orchestration-cases.js";
import {
  cache,
  clock,
  clockEvents,
  entry,
  errorShape,
  fixture,
  handlerModule,
  json,
  load,
  observe,
} from "./webfetch-orchestration-fixture.js";
export const handlers = await load("tool/handlers/index");
export const { createToolRegistry } = await load("tool/registry");
export const { executeToolCall } = await load("tool/executor/call-runner");
export const { PermissionService } = await load("permission/service");
export const { resolveRuntimePermissionCapability } = await load(
  "tool/executor/permission-capability",
);
export const registryVariants = [
  {},
  { disallowedTools: ["WebFetch"] },
  { allowedTools: [] },
  { includeAgent: false },
];
export function registryObservation(options: any) {
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, { allowedTools: ["WebFetch"], ...options });
  return json({ names: registry.list(), contracts: registry.toContracts() });
}
export function executorFixture(c: FetchCase, decision = "allow") {
  const direct = fixture(c),
    { handler, ...rest } = entry,
    f = invocation(rest);
  f.call.input = direct.input;
  f.behavior.decision = decision as any;
  f.deps.httpClientPort = direct.http;
  if (c.noHttp) f.deps.httpClientPort = undefined;
  f.deps.model = c.noModel ? undefined : direct.model;
  f.deps.artifactStore = c.artifact ? direct.artifact : undefined;
  const registry = createToolRegistry();
  registry.register(f.entry);
  f.deps.registry = registry;
  f.behavior.handler = (input, context) => handler(input, context);
  return { ...f, direct, execute: (options?: any) => f.run(options, executeToolCall) };
}
export const executorCases = directCases
  .filter((c) => !c.body || c.body.length < 1000)
  .filter((_, i) => i % 3 === 0);
export async function observeExecutor(c: FetchCase, decision = "allow") {
  return clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const f = executorFixture(c, decision),
      results = [];
    for (let i = 0; i < (c.repeat ?? 1); i++) {
      f.call.id = `synthetic-executor-call-${i}` as any;
      const r = await f.execute({
        traceContext: { traceId: "synthetic-executor-trace", spanId: "synthetic-caller-span" },
      });
      results.push({
        success: r.success,
        output: r.output,
        modelContent: r.modelContent,
        display: r.display,
        serialization: r.serialization,
        error: r.error ? errorShape(r.error) : undefined,
        turnControl: r.turnControl,
      });
    }
    const spans = f.observed.contexts.map((ctx) => ctx.spanId);
    const propagation = f.direct.rawCalls
      .filter((c) => c.target === "request")
      .map((c) => spans.includes(c.args[0].trace.spanId));
    const observed = {
      results,
      calls: f.direct.calls,
      timeline: f.timeline,
      events: f.events.map((e) => e.type),
      terminal: f.terminal().map((t) => t.name),
      spanPresent: spans.every((s) => typeof s === "string" && s.length > 0),
      propagation,
      clock: clockEvents.slice(),
    };
    return JSON.parse(
      JSON.stringify(observed, (_key, value) =>
        spans.includes(value) ? "synthetic-generated-span" : value,
      ),
    );
  });
}
export function permissions() {
  const facts = [];
  for (const mode of ["build", "edit", "plan", "yolo", "auto"])
    for (const approved of [false, true])
      for (const rule of ["none", "ask", "deny"])
        for (const runtimeScope of ["main", "subagent"]) {
          const input = {
            url: approved ? "https://docs.python.org/owned-fixture" : URL_FIXTURE,
            prompt: "synthetic",
          };
          const service = new PermissionService({
            allowedTools: new Set(),
            disallowedTools: new Set(),
            autoApproveHighRisk: false,
            allowMediumRiskInAutoMode: false,
          });
          facts.push({
            mode,
            approved,
            rule,
            runtimeScope,
            decision: service.checkPermission(
              { toolName: "WebFetch", input, mode },
              resolveRuntimePermissionCapability(entry, input, {
                runtimeScope,
                workingDirectory: ".",
                workspaceRoot: ".",
              }),
              rule === "none"
                ? undefined
                : { [rule]: [{ toolName: "WebFetch", ruleContent: input.url }] },
            ),
          });
        }
  return json(facts);
}
export async function cacheMatrix() {
  const digest = createHash("sha256");
  let comparisons = 0;
  for (const url of [URL_FIXTURE, "http://owned-webfetch.example/fixture", URL_FIXTURE + "#owned"])
    for (const age of [0, 899900, 900000, 900001])
      for (const status of [200, 302, 403]) {
        const fact = await observe({
          label: "cache matrix",
          url,
          advance: age,
          status,
          repeat: 2,
          ...(status === 302
            ? { headers: { location: "https://other-owned.example/target" } }
            : {}),
        });
        digest.update(JSON.stringify(fact) + "\n");
        comparisons++;
      }
  return { comparisons, sha256: digest.digest("hex") };
}
export function cached(url: string) {
  return cache.getWebFetchCache(url);
}
