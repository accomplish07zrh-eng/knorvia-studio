// SPDX-License-Identifier: Apache-2.0
// shared-04 合同测试：启动错误、内存诊断、本地 TTFT、调试、追踪与 Markdown（B32–B39）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadModule, entryLabel } from "./entry.mjs";
import { assertJsonEqual, readFixture, rehydrate } from "./fixtures.mjs";

const fixture = readFixture("diagnostics.json");
const db = await loadModule("database-startup.ts");
const memory = await loadModule("memoryDiagnostics.ts");
const ttft = await loadModule("localTtft.ts");
const debug = await loadModule("session-debug.ts");
const trace = await loadModule("rendererActionTrace.ts");
const line = await loadModule("lineChangeStat.ts");
const images = await loadModule("markdown-artifact-images.ts");

test(`B32 database-startup 分类：cause 链、errcode 低 8 位与关键词（${entryLabel}）`, () => {
  assertJsonEqual(
    [...db.databaseStartupErrorCodeSchema.options].sort(),
    fixture.databaseStartup.codes,
  );
  assertJsonEqual([...db.databaseStartupPhaseSchema.options], fixture.databaseStartup.phases);
  for (const entry of fixture.databaseStartup.classify) {
    assert.equal(
      db.classifyDatabaseStartupError(rehydrate(entry.input)),
      entry.output,
      JSON.stringify(entry.input),
    );
  }
  assert.equal(db.classifyDatabaseStartupError({ errcode: 13 + 256 }), "storage_full");
  assert.equal(db.classifyDatabaseStartupError({ errcode: 7 }), "out_of_memory");
});

test("B33 database-startup 详情与重试规则", () => {
  assertJsonEqual(
    db.databaseStartupErrorDetails({
      errcode: 13,
      code: "ENOSPC",
      migrationId: "m-1",
      cause: { errcode: 3, code: "lower", migrationId: "bad id" },
    }),
    fixture.databaseStartup.details[0],
  );
  assertJsonEqual(
    db.databaseStartupErrorDetails(new Error("plain")),
    fixture.databaseStartup.details[1],
  );
  assertJsonEqual(
    db.databaseStartupErrorDetails({ systemCode: 28, sqliteCode: 13 }),
    fixture.databaseStartup.details[2],
  );
  for (const entry of fixture.databaseStartup.retry) {
    assert.equal(
      db.canRetryDatabaseStartup(entry.input),
      entry.output,
      JSON.stringify(entry.input),
    );
  }
  assert.equal(
    db.canRetryDatabaseStartup({ phase: "failed", failedPhase: "starting_services" }),
    false,
  );
});

test("B34 database-startup schema 面：state/control/port/migration", () => {
  for (const entry of fixture.databaseStartup.state) {
    assert.equal(
      db.databaseStartupStateSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of fixture.databaseStartup.schemas.control) {
    assert.equal(
      db.databaseStartupControlSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of fixture.databaseStartup.schemas.portPayload) {
    assert.equal(
      db.databaseStartupPortPayloadSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of fixture.databaseStartup.schemas.migration) {
    assert.equal(
      db.databaseMigrationIdSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
});

test("B35 memoryDiagnostics：采样门阈值、格式顺序与 registry 隔离", () => {
  assertJsonEqual(
    {
      intervalMs: memory.MEMORY_SAMPLE_INTERVAL_MS,
      defaultHeapDeltaRatio: memory.MEMORY_SAMPLE_HEAP_DELTA_RATIO,
      defaultNativeDeltaRatio: memory.MEMORY_SAMPLE_NATIVE_DELTA_RATIO,
      defaultHeartbeatMs: memory.MEMORY_SAMPLE_HEARTBEAT_MS,
    },
    fixture.memory.constants,
  );
  const gate = memory.createMemorySampleWriteGate({
    heapDeltaRatio: 0.5,
    nativeDeltaRatio: 0.5,
    heartbeatMs: 1000,
  });
  const sample = (over) => ({ role: "main", counters: {}, rssKb: 100, heapUsedKb: 100, ...over });
  const decisions = [
    gate.evaluate(sample({}), 0),
    gate.evaluate(sample({ rssKb: 120 }), 10),
    gate.evaluate(sample({ rssKb: 160 }), 20),
    gate.evaluate(sample({ rssKb: 160, counters: { a: 1 } }), 30),
    gate.evaluate(sample({ rssKb: 160, counters: { a: 1 } }), 500),
    gate.evaluate(sample({ rssKb: 160, counters: { a: 1 } }), 1031),
    gate.evaluate(sample({ heapUsedKb: 101, rssKb: 160, counters: { a: 1 } }), 1032),
  ];
  assertJsonEqual(decisions, fixture.memory.gate);
  assertJsonEqual(
    [
      memory.bytesToKb(1536),
      memory.bytesToKb(0),
      memory.memoryUsageToSampleFields({ rss: 1024, heapUsed: 1536, external: 0 }),
      memory.formatMemorySampleLine(
        { role: "renderer", rssKb: 10.4, heapUsedKb: 2, counters: { b: 1.6, a: 2 } },
        "first",
      ),
      memory.formatMemorySampleLine({ role: "main", counters: { z: 1 } }, "changed"),
      memory.formatMemorySampleLine({ role: "main", counters: {} }, "heartbeat"),
    ],
    fixture.memory.format,
  );
  const registry = memory.createMemoryDiagnosticsRegistry();
  const first = registry.register("a", () => ({ x: 1, y: Number.NaN }));
  const failing = registry.register("b", () => {
    throw new Error("x");
  });
  assertJsonEqual(registry.collect(), fixture.memory.registry.first);
  const replacement = registry.register("a", () => ({ x: 2 }));
  assertJsonEqual(registry.collect(), fixture.memory.registry.replaced);
  first.dispose();
  replacement.dispose();
  assertJsonEqual(registry.collect(), fixture.memory.registry.afterDispose);
  failing.dispose();
});

test("B36 localTtft：常量、校准网络/偏移/误差与 schema 边界", () => {
  assertJsonEqual(
    {
      stages: ttft.LOCAL_TTFT_STAGES,
      buckets: ttft.LOCAL_TTFT_BUCKETS_MS,
      maxDetails: ttft.LOCAL_TTFT_MAX_DETAILS,
      preparationStages: ttft.LOCAL_TTFT_PREPARATION_STAGES,
      pending: ttft.LOCAL_TTFT_MAX_PENDING,
      ttl: ttft.LOCAL_TTFT_TTL_MS,
      clockErrorTtl: ttft.LOCAL_TTFT_CLOCK_TTL_MS,
      clockErrorMax: ttft.LOCAL_TTFT_CLOCK_MAX_ERROR_MS,
    },
    fixture.localTtft.constants,
  );
  for (const entry of fixture.localTtft.calibration) {
    const start = entry.start === "NaN" ? Number.NaN : entry.start;
    assertJsonEqual(
      ttft.calibrateLocalTtftClock(start, entry.end, entry.facts),
      entry.output,
      JSON.stringify(entry),
    );
  }
  for (const entry of fixture.localTtft.schemas.detail) {
    assert.equal(
      ttft.localTtftDetailSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of fixture.localTtft.schemas.record) {
    assert.equal(
      ttft.localTtftRecordSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of fixture.localTtft.schemas.batch) {
    assert.equal(
      ttft.localTtftBatchSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of fixture.localTtft.schemas.facts) {
    assert.equal(
      ttft.localTtftFactsSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
});

test("B37 session-debug：上限常量与 output TPS 有限正时长", () => {
  assertJsonEqual(debug.SESSION_DEBUG_LIMITS, fixture.sessionDebug.constants);
  for (const entry of fixture.sessionDebug.tps) {
    const outputTokens =
      entry.outputTokens === null
        ? undefined
        : entry.outputTokens === "Infinity"
          ? Number.POSITIVE_INFINITY
          : entry.outputTokens;
    const durationMs =
      entry.durationMs === null
        ? null
        : entry.durationMs === "Infinity"
          ? Number.POSITIVE_INFINITY
          : entry.durationMs;
    assert.equal(
      debug.calculateOutputTps(outputTokens, durationMs),
      entry.output,
      JSON.stringify(entry),
    );
  }
});

test("B38 rendererActionTrace：采样上限、strict 与 end≥start、实例一致", () => {
  assertJsonEqual(
    {
      serviceName: trace.RENDERER_ACTION_TRACE_SERVICE_NAME,
      maxSampleRatio: trace.RENDERER_ACTION_TRACE_MAX_SAMPLE_RATIO,
      maxBatchSpans: trace.RENDERER_ACTION_TRACE_MAX_BATCH_SPANS,
      maxBatchBytes: trace.RENDERER_ACTION_TRACE_MAX_BATCH_BYTES,
      disabled: trace.DISABLED_RENDERER_ACTION_TRACE_CONFIG,
    },
    fixture.rendererActionTrace.constants,
  );
  for (const entry of fixture.rendererActionTrace.config) {
    assert.equal(
      trace.rendererActionTraceConfigSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of fixture.rendererActionTrace.span) {
    assert.equal(
      trace.rendererActionTraceSpanSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input.attributes),
    );
  }
  for (const entry of fixture.rendererActionTrace.batch) {
    assert.equal(
      trace.rendererActionTraceBatchSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input.resource),
    );
  }
});

test("B39 lineChangeStat 与 markdown-artifact-images", () => {
  for (const entry of fixture.lineChange) {
    assertJsonEqual(
      line.computeLineChangeStat(entry.before, entry.after),
      entry.output,
      `${JSON.stringify(entry.before)} → ${JSON.stringify(entry.after)}`,
    );
  }
  for (const entry of fixture.markdownImages.extract) {
    assertJsonEqual(
      images.extractMarkdownArtifactImageRefs(entry.input),
      entry.output,
      entry.input,
    );
  }
  for (const entry of fixture.markdownImages.rewrite) {
    assert.equal(
      images.rewriteMarkdownArtifactImageSources(entry.input),
      entry.output,
      entry.input,
    );
  }
  for (const entry of fixture.markdownImages.decode) {
    assert.equal(images.decodeMarkdownArtifactImageSource(entry.input), entry.output, entry.input);
  }
});
