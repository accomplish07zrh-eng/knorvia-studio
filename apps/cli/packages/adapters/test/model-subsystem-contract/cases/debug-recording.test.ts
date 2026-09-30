// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collect,
  generateResult,
  resolvedModel,
  streamResult,
  textRequest,
  traceContext,
} from "../harness/fixtures.js";
import { settleOwnedWork, useSeams } from "../harness/lifecycle.js";
import { loadTargetModule } from "../harness/loader.js";

const MIB = 1_024 * 1_024;

test("model I/O recording defaults on, test disables it, and development is detected exactly", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-debug")>("runner-debug");
  assert.equal(module.shouldRecordModelIO({}), true);
  assert.equal(module.shouldRecordModelIO({ KNORVIA_RUNTIME_ENV: "production" }), true);
  assert.equal(module.shouldRecordModelIO({ KNORVIA_RUNTIME_ENV: "development" }), true);
  assert.equal(module.shouldRecordModelIO({ KNORVIA_RUNTIME_ENV: "test" }), false);
  assert.equal(module.isDevelopmentModelIOEnv({ KNORVIA_RUNTIME_ENV: "development" }), true);
  assert.equal(module.isDevelopmentModelIOEnv({}), false);
});

test("debug sanitization recursively removes credentials, metadata ids, and raw media", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/runner-debug-redaction")>(
      "runner-debug-redaction",
    );
  const metadata = await loadTargetModule<typeof import("@target/anthropic-request-metadata")>(
    "anthropic-request-metadata",
  );
  const sanitized = module.sanitizeModelIODebugRecord({
    request: {
      body: {
        image: {
          data: "IMAGE_SECRET",
          media_type: "image/png",
          type: "base64",
        },
        video: { data: "VIDEO_SECRET", mediaType: "video/mp4", type: "file" },
      },
      headers: {
        Authorization: "Bearer secret",
        Cookie: "session=secret",
        "x-api-key": "key-secret",
      },
    },
    response: { headers: { "Set-Cookie": "response=secret", "x-safe": "ok" } },
    visible: "keep-me",
  });
  const text = JSON.stringify(sanitized);
  assert.match(text, /keep-me/u);
  assert.doesNotMatch(
    text,
    /Bearer secret|session=secret|key-secret|response=secret|IMAGE_SECRET|VIDEO_SECRET/u,
  );
  const redactedMetadata = metadata.redactAnthropicRequestMetadata({
    metadata: { user_id: "wire-user-secret" },
    providerOptions: { anthropic: { metadata: { userId: "provider-user-secret" } } },
  });
  assert.doesNotMatch(JSON.stringify(redactedMetadata), /wire-user-secret|provider-user-secret/u);
});

test("generate honors skipTranscript while stream intentionally ignores it", async (context) => {
  const seams = useSeams(context);
  const generate =
    await loadTargetModule<typeof import("@target/runner-generate")>("runner-generate");
  await generate.runGenerateText({
    debugDir: "/debug/generate-skip",
    env: { KNORVIA_RUNTIME_ENV: "production" },
    modelIoFullRetentionEnabled: false,
    request: runtimeRequest({ metadata: { skipTranscript: true } }),
    resolveModel: () => resolvedModel() as never,
    resolved: resolvedModel() as never,
    retry: retryOptions(),
    runtime: {
      async generateText() {
        return generateResult() as never;
      },
      streamText() {
        throw new Error("not used");
      },
    },
  });
  await settleOwnedWork(seams);
  assert.equal(
    seams.fs.listFiles().some((file) => file.includes("generate-skip")),
    false,
  );

  const stream = await loadTargetModule<typeof import("@target/runner-stream")>("runner-stream");
  await collect(
    stream.runStreamText({
      debugDir: "/debug/stream-record",
      env: { KNORVIA_RUNTIME_ENV: "production" },
      modelIoFullRetentionEnabled: false,
      request: runtimeRequest({ metadata: { skipTranscript: true } }),
      resolveModel: () => resolvedModel() as never,
      resolved: resolvedModel() as never,
      retry: retryOptions(),
      runtime: {
        async generateText() {
          throw new Error("not used");
        },
        streamText() {
          return streamResult(
            [
              { id: "t", type: "text-start" },
              { id: "t", text: "streamed", type: "text-delta" },
              { id: "t", type: "text-end" },
              {
                finishReason: "stop",
                totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                type: "finish",
              },
            ],
            { text: Promise.resolve("streamed") },
          ) as never;
        },
      },
      streamIdleTimeoutMs: 1_000,
    }),
  );
  await settleOwnedWork(seams);
  assert.equal(
    seams.fs.listFiles().some((file) => file.includes("stream-record")),
    true,
  );
});

test("production keeps at most three session files and overwrites at the 64 MiB bound", async (context) => {
  const seams = useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-debug")>("runner-debug");
  const currentSessionId = "session-3";
  const observationDeadline = performance.now() + 4_000;
  for (let index = 0; index < 4; index += 1) {
    const before = snapshotDirectory(seams, "/debug/retention/");
    module.recordGenerateTextDebug(
      debugInput({
        debugDir: "/debug/retention",
        request: runtimeRequest({
          traceContext: {
            ...traceContext(),
            sessionId: (index === 3 ? currentSessionId : `session-${index}`) as never,
          },
        }),
        requestId: `request-${index}`,
      }),
    );
    await waitForNewNonEmptyRecord(seams, "/debug/retention/", before, observationDeadline);
    seams.clock.setNow(seams.clock.now() + 1_000);
  }
  const files = seams.fs.listFiles().filter((file) => file.startsWith("/debug/retention/"));
  const current = files.at(-1);
  assert.ok(current);
  seams.fs.seedSize(current, 64 * MIB);
  const beforeLimit = snapshotDirectory(seams, "/debug/retention/");
  seams.fs.resetCalls();
  module.recordGenerateTextDebug(
    debugInput({
      debugDir: "/debug/retention",
      request: runtimeRequest({
        traceContext: { ...traceContext(), sessionId: currentSessionId as never },
      }),
      requestId: "after-limit",
    }),
  );
  await waitForNewNonEmptyRecord(seams, "/debug/retention/", beforeLimit, observationDeadline);
  await waitForFileSizeChange(seams, current, 64 * MIB, observationDeadline);
  assert.ok(files.length <= 3);
  assert.ok((seams.fs.byteLength(current) ?? Number.POSITIVE_INFINITY) < 64 * MIB);
});

test("development uses the 256 MiB bound", async (context) => {
  const seams = useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-debug")>("runner-debug");
  const observationDeadline = performance.now() + 4_000;
  const beforeInitial = snapshotDirectory(seams, "/debug/development/");
  module.recordGenerateTextDebug(debugInput({ debugDir: "/debug/development", isDev: true }));
  await waitForNewNonEmptyRecord(seams, "/debug/development/", beforeInitial, observationDeadline);
  const file = seams.fs
    .listFiles()
    .find((candidate) => candidate.startsWith("/debug/development/"));
  assert.ok(file);
  seams.fs.seedSize(file, 256 * MIB);
  const beforeLimit = snapshotDirectory(seams, "/debug/development/");
  module.recordGenerateTextDebug(
    debugInput({ debugDir: "/debug/development", isDev: true, requestId: "dev-limit" }),
  );
  await waitForNewNonEmptyRecord(seams, "/debug/development/", beforeLimit, observationDeadline);
  await waitForFileSizeChange(seams, file, 256 * MIB, observationDeadline);
  assert.ok((seams.fs.byteLength(file) ?? Number.POSITIVE_INFINITY) <= 256 * MIB);
});

test("full retention skips rotation and compression but remains redacted", async (context) => {
  const seams = useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-debug")>("runner-debug");
  const observationDeadline = performance.now() + 4_000;
  for (let index = 0; index < 4; index += 1) {
    const before = snapshotDirectory(seams, "/debug/full/");
    module.recordGenerateTextDebug(
      debugInput({
        debugDir: "/debug/full",
        modelIoFullRetentionEnabled: true,
        options: {
          headers: { authorization: "Bearer FULL_SECRET" },
          messages: [{ content: `full-${index}`, role: "user" }],
        } as never,
        request: runtimeRequest({
          traceContext: { ...traceContext(), sessionId: `full-${index}` as never },
        }),
        requestId: `full-${index}`,
      }),
    );
    await waitForNewNonEmptyRecord(seams, "/debug/full/", before, observationDeadline);
    seams.clock.setNow(seams.clock.now() + 1_000);
  }
  const files = seams.fs.listFiles().filter((file) => file.startsWith("/debug/full/"));
  assert.ok(files.length >= 1);
  assert.equal(
    seams.fs.calls.some((call) => ["rename", "rm", "rmSync", "unlink"].includes(call.operation)),
    false,
  );
  const retained = files.map((file) => seams.fs.text(file)).join("\n");
  assert.match(retained, /full-0/u);
  assert.match(retained, /full-3/u);
  assert.doesNotMatch(retained, /FULL_SECRET/u);
});

test("production success removes duplicate request/response bodies while failure retains provider body", async (context) => {
  const seams = useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-debug")>("runner-debug");
  const successBefore = snapshotDirectory(seams, "/debug/compression-success/");
  module.recordGenerateTextDebug(
    debugInput({
      debugDir: "/debug/compression-success",
      options: {
        messages: [{ content: "DUPLICATE_SDK_MESSAGES", role: "user" }],
      } as never,
      result: generateResult({
        request: { body: { messages: ["DUPLICATE_BODY_MESSAGES"] } },
        response: { body: "DUPLICATE_RESPONSE_BODY", messages: ["response-message"] },
      }) as never,
    }),
  );
  const successText = await waitForNewNonEmptyRecord(
    seams,
    "/debug/compression-success/",
    successBefore,
  );
  assert.doesNotMatch(
    successText,
    /DUPLICATE_SDK_MESSAGES|DUPLICATE_BODY_MESSAGES|DUPLICATE_RESPONSE_BODY/u,
  );

  const failureBefore = snapshotDirectory(seams, "/debug/compression-failure/");
  module.recordGenerateTextDebug(
    debugInput({
      debugDir: "/debug/compression-failure",
      error: new Error("provider failure"),
      result: generateResult({
        request: { body: { messages: ["FAILURE_BODY_MESSAGES"] } },
      }) as never,
    }),
  );
  const failureText = await waitForNewNonEmptyRecord(
    seams,
    "/debug/compression-failure/",
    failureBefore,
  );
  assert.match(failureText, /FAILURE_BODY_MESSAGES/u);
});

test("records fall back to bounded context when continuity cannot be established", async (context) => {
  const seams = useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-debug")>("runner-debug");
  const messages = Array.from({ length: 80 }, (_, index) => ({
    content: `message-${index}`,
    role: "user",
  }));
  const before = snapshotDirectory(seams, "/debug/delta/");
  module.recordGenerateTextDebug(
    debugInput({
      debugDir: "/debug/delta",
      options: { messages } as never,
      request: runtimeRequest({ messages: messages as never }),
    }),
  );
  const record = await waitForNewNonEmptyRecord(seams, "/debug/delta/", before);
  assert.doesNotMatch(record, /message-0"/u);
  assert.match(record, /message-79/u);
  assert.ok((record.match(/message-/gu) ?? []).length <= 64);
});

function debugInput(
  overrides: Partial<
    Parameters<typeof import("@target/runner-debug").recordGenerateTextDebug>[0]
  > = {},
): Parameters<typeof import("@target/runner-debug").recordGenerateTextDebug>[0] {
  return {
    attempt: 1,
    debugDir: "/debug/default",
    isDev: false,
    modelIoFullRetentionEnabled: false,
    normalizedToolCalls: [],
    options: { messages: [{ content: "hello", role: "user" }] } as never,
    recordModelIO: true,
    request: runtimeRequest(),
    requestId: "request-debug",
    resolved: resolvedModel() as never,
    result: generateResult() as never,
    startedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function runtimeRequest(
  overrides: Record<string, unknown> = {},
): import("@target/runner-runtime").AiSdkModelTextRequest {
  return {
    ...textRequest(),
    traceContext: traceContext(),
    ...overrides,
  } as unknown as import("@target/runner-runtime").AiSdkModelTextRequest;
}

function retryOptions(): import("@target/retry-policy").ResolvedAiSdkModelRetryOptions {
  return { backoffFactor: 2, baseDelayMs: 0, jitter: false, maxAttempts: 1, maxDelayMs: 60_000 };
}

function readDirectory(seams: ReturnType<typeof useSeams>, prefix: string): string {
  return [...snapshotDirectory(seams, prefix).values()].join("\n");
}

function snapshotDirectory(
  seams: ReturnType<typeof useSeams>,
  prefix: string,
): ReadonlyMap<string, string> {
  return new Map(
    seams.fs
      .listFiles()
      .filter((file) => file.startsWith(prefix))
      .map((file) => [file, seams.fs.text(file) ?? ""]),
  );
}

async function waitForNewNonEmptyRecord(
  seams: ReturnType<typeof useSeams>,
  prefix: string,
  before: ReadonlyMap<string, string>,
  deadline = performance.now() + 4_000,
): Promise<string> {
  while (performance.now() <= deadline) {
    const current = snapshotDirectory(seams, prefix);
    const observed = [...current].some(
      ([file, content]) => content.length > 0 && content !== before.get(file),
    );
    if (observed) return readDirectory(seams, prefix);
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
  const files = [...snapshotDirectory(seams, prefix).keys()];
  const operations = seams.fs.calls.slice(-12).map(({ operation }) => operation);
  throw new Error(
    `No new nonempty debug record was observed before the debug observation deadline for ${prefix}; files=${JSON.stringify(files)}; recentFsOperations=${JSON.stringify(operations)}`,
  );
}

async function waitForFileSizeChange(
  seams: ReturnType<typeof useSeams>,
  file: string,
  before: number,
  deadline = performance.now() + 4_000,
): Promise<void> {
  while (performance.now() <= deadline) {
    if (seams.fs.byteLength(file) !== before) return;
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
  const files = seams.fs.listFiles();
  const operations = seams.fs.calls.slice(-12).map(({ operation }) => operation);
  throw new Error(
    `Debug file size did not change before the debug observation deadline for ${file}; files=${JSON.stringify(files)}; recentFsOperations=${JSON.stringify(operations)}`,
  );
}
