import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { invocation } from "./tool-invocation-fixture.js";
import type { ReadScenario } from "./read-orchestration-cases.js";
import {
  load,
  entry,
  fixture,
  json,
  clock,
  clockEvents,
  CWD,
  ROOT,
  errorShape,
  observe,
} from "./read-orchestration-fixture.js";
export const handlers = await load("tool/handlers/index");
export const { createToolRegistry } = await load("tool/registry");
export const { executeToolCall } = await load("tool/executor/call-runner");
export const { PermissionService } = await load("permission/service");
export const { resolveRuntimePermissionCapability } = await load(
  "tool/executor/permission-capability",
);
export const registryVariants = [
  {},
  { disallowedTools: ["Read"] },
  { allowedTools: [] },
  { includeAgent: false },
];
export function registryObservation(options: any) {
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, { allowedTools: ["Read"], ...options });
  return json({ names: registry.list(), contracts: registry.toContracts() });
}
export function executorFixture(c: ReadScenario, decision = "allow") {
  const direct = fixture(c),
    { handler, ...rest } = entry,
    f = invocation(rest);
  f.call.input = direct.input;
  f.behavior.decision = decision as any;
  f.deps.fileSystemPort = direct.context.fileSystemPort;
  f.deps.imageProcessorPort = direct.context.imageProcessorPort;
  f.deps.pdfDocumentPort = direct.context.pdfDocumentPort;
  f.deps.readFileState = direct.context.readFileState;
  f.deps.getWorkingDirectory = () => direct.context.workingDirectory;
  f.deps.getWorkspaceRoot = () => direct.context.workspaceRoot;
  f.deps.model = direct.context.model;
  const registry = createToolRegistry();
  registry.register(f.entry);
  f.deps.registry = registry;
  f.behavior.handler = (input, context) => handler(input, context);
  return { ...f, direct, execute: (options?: any) => f.run(options, executeToolCall) };
}
const CAPTURE_ROOT = "/tmp/knorvia-owned-read-orchestration";
export function executorContractForRoot(frozen: any, root = ROOT) {
  const expected = structuredClone(frozen);
  for (const result of expected.results) {
    const serialization = result.serialization;
    if (
      (result.output?.type !== "pdf" && result.output?.type !== "parts") ||
      !serialization?.content.includes("$FIXTURE")
    )
      continue;
    // 修复：golden 的路径已归一化，但 PDF prose 字节数仍绑定捕获根；只调整预期值。
    assert.equal(serialization.truncated, false);
    const capturedBytes = Buffer.byteLength(
      serialization.content.replaceAll("$FIXTURE", CAPTURE_ROOT),
      "utf8",
    );
    assert.equal(serialization.originalBytes, capturedBytes);
    assert.equal(serialization.returnedBytes, capturedBytes);
    const delta =
      Buffer.byteLength(serialization.content.replaceAll("$FIXTURE", root), "utf8") - capturedBytes;
    serialization.originalBytes += delta;
    serialization.returnedBytes += delta;
  }
  return expected;
}
export async function observeExecutor(c: ReadScenario, decision = "allow") {
  return clock(async () => {
    const f = executorFixture(c, decision),
      results = [];
    for (let i = 0; i < (c.repeats ?? 1); i++) {
      f.call.id = `synthetic-executor-call-${i}` as any;
      const r = await f.execute({
        traceContext: { traceId: "synthetic-executor-trace", spanId: "synthetic-caller-span" },
      });
      results.push({
        success: r.success,
        output: r.output,
        modelContent: r.modelContent,
        display: r.display,
        readFileStateMetadata: r.readFileStateMetadata,
        error: r.error ? errorShape(r.error) : undefined,
        serialization: r.serialization,
        turnControl: r.turnControl,
      });
    }
    const contexts = f.observed.contexts;
    const propagation = f.direct.rawCalls
      .filter((c) => c.args[0]?.trace)
      .map((c) => contexts.some((ctx) => ctx.spanId === c.args[0].trace.spanId));
    for (const c of f.direct.calls)
      if (c.request?.trace) c.request.trace.spanId = "synthetic-generated-span";
    return json({
      results,
      calls: f.direct.calls,
      state: f.direct.snapshot(),
      timeline: f.timeline,
      eventTypes: f.events.map((e) => e.type),
      terminal: f.terminal().map((t) => t.name),
      spanPresent: contexts.every((ctx) => typeof ctx.spanId === "string" && ctx.spanId.length > 0),
      propagation,
      clock: clockEvents.slice(),
    });
  });
}
export function permissionObservations() {
  const facts = [];
  for (const mode of ["build", "edit", "plan", "yolo", "auto"])
    for (const deny of [false, true])
      for (const runtimeScope of ["main", "subagent"]) {
        const service = new PermissionService({
          allowedTools: new Set(),
          disallowedTools: new Set(deny ? ["Read"] : []),
          autoApproveHighRisk: false,
          allowMediumRiskInAutoMode: false,
        });
        const input = { file_path: join(CWD, "synthetic.txt") };
        facts.push({
          mode,
          deny,
          runtimeScope,
          decision: service.checkPermission(
            { toolName: "Read", input, mode },
            resolveRuntimePermissionCapability(entry, input, {
              workingDirectory: CWD,
              workspaceRoot: ROOT,
              runtimeScope,
            }),
          ),
        });
      }
  return json(facts);
}
export const modelContexts = [
  undefined,
  {},
  { model: {} },
  { model: { properties: { inputFormat: {} } } },
  ...[true, false, "yes", null].map((supportsPdf) => ({
    model: { properties: { inputFormat: { supportsPdf } } },
  })),
];
export function modelObservation(context: any) {
  const call = (fn: () => any) => {
    try {
      return { output: fn() };
    } catch (error) {
      return { error: errorShape(error) };
    }
  };
  return {
    contract: call(() => entry.resolveModelContract(context)),
    timeouts: [{}, { file_path: "synthetic.pdf" }, { file_path: "synthetic.pdf", pages: "1" }].map(
      (input) => call(() => entry.resolveTimeoutBudgetMs(input, context)),
    ),
  };
}
export async function freshnessMatrix() {
  const digest = createHash("sha256");
  let comparisons = 0;
  for (const partial of [false, true])
    for (const mtime of [undefined, 90.1, 90.9, 91])
      for (const size of [undefined, 15, 16])
        for (const revision of [undefined, "synthetic-stat-revision", "other"])
          for (const statMode of ["mtime", "revision", "size"]) {
            const stat =
              statMode === "mtime"
                ? {}
                : statMode === "revision"
                  ? { mtimeMs: undefined, revision: { id: "synthetic-stat-revision" } }
                  : { mtimeMs: undefined, revision: undefined };
            const fact = await observe({
              label: "matrix",
              stat,
              cache: {
                content: "cached",
                isPartialView: partial,
                mtimeMs: mtime,
                sizeBytes: size,
                revisionId: revision,
              },
            });
            digest.update(JSON.stringify(fact) + "\n");
            comparisons++;
          }
  return { comparisons, sha256: digest.digest("hex") };
}
