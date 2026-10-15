// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-bash-01：IO 重路径的端口替身单测（behavior.md「未覆盖」节）。
// 覆盖 bash.ts 执行编排（前台/空命令/显式后台/闲时拒绝/进度事件）、toBashOutput
// 投影（退出码读数、限流提示）、prepareBashImageOutput（缩放与原图回退）、
// applyBashReadFileStateEffects（过期提示与回填）、supportsBashBackgroundLifecycle、
// resolveBashPermissionRulePolicy（稳定动作前缀折叠）与 selectReadContent 窗口语义。
import assert from "node:assert/strict";
import { test } from "node:test";

import { SessionEventType } from "@knorvia/contracts";

import { supportsBashBackgroundLifecycle } from "../src/tool/handlers/bash-background-lifecycle.js";
import { resolveBashPermissionRulePolicy } from "../src/tool/handlers/bash-command-permission-policy.js";
import { prepareBashImageOutput } from "../src/tool/handlers/bash-image-output.js";
import { toBashOutput } from "../src/tool/handlers/bash-output.js";
import {
  collectBashReadFileSources,
  selectReadContent,
} from "../src/tool/handlers/bash-read-file-sources.js";
import { applyBashReadFileStateEffects } from "../src/tool/handlers/bash-read-file-state.js";
import { bashToolEntry } from "../src/tool/handlers/bash.js";
import { readToolExecutionTelemetry } from "../src/tool/handlers/tool-perf.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

type PortDouble = Record<string, unknown>;

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const ONE_PIXEL_PNG_DATA_URL = `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`;

function completedResult(overrides: Record<string, unknown> = {}) {
  return {
    status: "completed",
    exitCode: 0,
    timedOut: false,
    cancelled: false,
    durationMs: 12,
    stdout: { text: "hello\n", bytes: 6, truncated: false },
    stderr: { text: "", bytes: 0, truncated: false },
    ...overrides,
  };
}

// 工作区根按平台取值：Windows 用盘符路径、POSIX 用根下目录，保证 path-policy 两侧都接受。
const WORKSPACE_ROOT = process.platform === "win32" ? "C:/ws" : "/ws";

function contextDouble(port: PortDouble, extra: Record<string, unknown> = {}) {
  const ctx = {
    toolCallId: "call-fixture",
    toolName: "Bash",
    executionPort: port,
    abortSignal: new AbortController().signal,
    workingDirectory: WORKSPACE_ROOT,
    workspaceRoot: WORKSPACE_ROOT,
    ...extra,
  };
  return ctx as unknown as ToolExecutionContext;
}

function runHandler(input: unknown, ctx: ToolExecutionContext) {
  const handler = (bashToolEntry as { handler: (i: unknown, c: unknown) => Promise<unknown> })
    .handler;
  return handler(input, ctx);
}

test("foreground run projects the execution result and forwards the request shape", async () => {
  let observedRequest: any;
  const port = {
    run: async (request: any) => {
      observedRequest = request;
      return completedResult();
    },
  };
  const output: any = await runHandler({ command: "ls -la" }, contextDouble(port));
  assert.equal(output.stdout, "hello\n");
  assert.equal(output.exitCode, 0);
  assert.equal(output.status, "completed");
  assert.equal(output.noOutputExpected, false);
  assert.equal(observedRequest.command.command, "ls -la");
  assert.equal(observedRequest.command.shellProfile, "posix-bash");
  assert.equal(observedRequest.captureCwdAfterSuccess, true);
  assert.equal(typeof observedRequest.timeoutMs, "number");
});

test("empty command short-circuits without touching the execution port", async () => {
  const port = {
    run: async () => {
      throw new Error("port must not be consulted for a blank command");
    },
  };
  const output: any = await runHandler({ command: "   " }, contextDouble(port));
  assert.equal(output.stdout, "");
  assert.equal(output.status, "completed");
  const perf = readToolExecutionTelemetry(output);
  assert.equal(perf?.detail?.kind, "command");
});

test("explicit background routes through the lifecycle method and projects task ids", async () => {
  let lifecycleMode: string | undefined;
  const port = {
    run: async () => {
      throw new Error("explicit background must not fall back to plain run");
    },
    runBashWithBackgroundLifecycle: async (_request: unknown, lifecycle: { mode: string }) => {
      lifecycleMode = lifecycle.mode;
      return {
        kind: "backgrounded",
        task: {
          taskId: "bg-77",
          outputPath: "C:/tmp/bg-77.log",
          stdoutPersistedOutputPath: "C:/tmp/bg-77.out",
          stderrPersistedOutputPath: "C:/tmp/bg-77.err",
        },
      };
    },
  };
  const output: any = await runHandler(
    { command: "sleep 300", run_in_background: true },
    contextDouble(port),
  );
  assert.equal(lifecycleMode, "explicit");
  assert.equal(output.status, "backgrounded");
  assert.equal(output.backgroundTaskId, "bg-77");
  assert.equal(output.persistedOutputPath, "C:/tmp/bg-77.log");
});

test("off-peak turns reject explicit background with a recoverable error", async () => {
  const port = { run: async () => completedResult() };
  await assert.rejects(
    () =>
      runHandler(
        { command: "sleep 5", run_in_background: true },
        contextDouble(port, { offPeakTurn: true }),
      ),
    (error: any) => error.recoverable === true,
  );
});

test("progress events are re-emitted as session ToolCallProgress and stamp first output", async () => {
  const emitted: any[] = [];
  const port = {
    run: async (_request: unknown, options: any) => {
      await options.onEvent({
        type: "progress",
        timestamp: 111,
        elapsedMs: 5,
        pid: 42,
        stdoutBytes: 3,
        stderrBytes: 0,
        outputPreview: "he",
        stdoutTail: "hello",
        stderrTail: "",
      });
      return completedResult();
    },
  };
  const ctx = contextDouble(port, { emitEvent: async (event: any) => void emitted.push(event) });
  const output: any = await runHandler({ command: "echo hi" }, ctx);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, SessionEventType.ToolCallProgress);
  assert.equal(emitted[0].payload.outputBytes, 3);
  const perf = readToolExecutionTelemetry(output);
  assert.equal(perf?.detail?.command?.firstOutputMs, 5);
});

test("toBashOutput maps terminal statuses and non-zero readings", async () => {
  const ctx = contextDouble({});
  const timedOut: any = await toBashOutput(
    completedResult({ status: "timed_out", timedOut: true }) as any,
    { command: "sleep 9" } as any,
    ctx,
  );
  assert.equal(timedOut.interrupted, true);
  assert.equal(timedOut.returnCodeInterpretation, "Command timed out");

  const grepMiss: any = await toBashOutput(
    completedResult({ exitCode: 1 }) as any,
    { command: "grep foo file.txt" } as any,
    ctx,
  );
  assert.equal(grepMiss.returnCodeInterpretation, "No matches found");
  assert.equal(grepMiss.stderr, "");
});

test("toBashOutput attaches the gh rate-limit hint once per cooldown", async () => {
  const ctx = contextDouble({});
  const throttledRun = () =>
    completedResult({
      stdout: { text: "API rate limit exceeded", bytes: 22, truncated: false },
    });
  const throttled: any = await toBashOutput(
    throttledRun() as any,
    { command: "gh pr list" } as any,
    ctx,
  );
  assert.ok(throttled.ghRateLimitHint);
  assert.match(throttled.ghRateLimitHint, /rate limit/i);
  const immediateRepeat: any = await toBashOutput(
    throttledRun() as any,
    { command: "gh pr list" } as any,
    ctx,
  );
  assert.equal(immediateRepeat.ghRateLimitHint, undefined);
});

test("prepareBashImageOutput passes images through and scales via the processor port", async () => {
  const passthrough = await prepareBashImageOutput(
    { inline: ONE_PIXEL_PNG_DATA_URL },
    contextDouble({}),
  );
  assert.equal(passthrough?.stdout, ONE_PIXEL_PNG_DATA_URL);

  let receivedDimension: number | undefined;
  const scaled = await prepareBashImageOutput(
    { inline: ONE_PIXEL_PNG_DATA_URL },
    contextDouble({}), // 占位：下方带端口的上下文
  );
  assert.equal(scaled?.stdout, ONE_PIXEL_PNG_DATA_URL);

  const withProcessor = contextDouble(
    {},
    {
      imageProcessorPort: {
        resizeToFit: async (job: any) => {
          receivedDimension = job.maxDimension;
          return { mediaType: "image/png", data: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64") };
        },
      },
    },
  );
  const resized = await prepareBashImageOutput({ inline: ONE_PIXEL_PNG_DATA_URL }, withProcessor);
  assert.equal(typeof receivedDimension, "number");
  assert.ok(resized?.stdout.startsWith("data:image/png;base64,"));
});

test("prepareBashImageOutput falls back to the verified original when resizing fails", async () => {
  const failingContext = contextDouble(
    {},
    {
      imageProcessorPort: {
        resizeToFit: async () => {
          throw new Error("decoder exploded");
        },
      },
    },
  );
  const fallback = await prepareBashImageOutput({ inline: ONE_PIXEL_PNG_DATA_URL }, failingContext);
  assert.equal(fallback?.stdout, ONE_PIXEL_PNG_DATA_URL);
});

test("applyBashReadFileStateEffects backfills read state from a cat run", async () => {
  const registry = new Map<string, unknown>();
  const disk = {
    stat: async () => ({
      kind: "file",
      sizeBytes: 4,
      mtimeMs: 5,
      revision: { id: "rev-1", mtimeMs: 5, sizeBytes: 4 },
    }),
    readTextFile: async () => ({
      content: "a\nb\n",
      truncated: false,
      revision: { id: "rev-1", mtimeMs: 5, sizeBytes: 4 },
    }),
  };
  const output: any = { status: "completed", stdoutTruncated: false };
  await applyBashReadFileStateEffects({
    command: "cat a.txt",
    context: contextDouble({}, { fileSystemPort: disk, readFileState: registry }),
    output,
    result: { exitCode: 0, startedAt: new Date(1000) } as any,
  });
  assert.equal(registry.size, 1);
  const [record] = [...registry.values()] as any[];
  assert.equal(String(record.path).replace(/\\/gu, "/"), `${WORKSPACE_ROOT}/a.txt`);
  assert.equal(record.content, "a\nb\n");
  assert.equal(record.revisionId, "rev-1");
  assert.equal(output.staleReadFileStateHint, undefined);
});

test("applyBashReadFileStateEffects flags stale reads after a write-marked command", async () => {
  const registry = new Map<string, unknown>();
  registry.set("key", {
    path: `${WORKSPACE_ROOT}/src/index.ts`,
    content: "stale",
    mtimeMs: 100,
    readAt: new Date(0),
    isPartialView: false,
  });
  const disk = {
    stat: async () => ({ kind: "file", sizeBytes: 9, mtimeMs: 5000, revision: undefined }),
    readTextFile: async () => {
      throw new Error("backfill should not run for this command shape");
    },
  };
  const output: any = { status: "completed", stdoutTruncated: false };
  await applyBashReadFileStateEffects({
    command: "npm run lint:fix",
    context: contextDouble({}, { fileSystemPort: disk, readFileState: registry }),
    output,
    result: { exitCode: 0, startedAt: new Date(50) } as any,
  });
  assert.match(output.staleReadFileStateHint ?? "", /Call Read before editing/);
  assert.match(output.staleReadFileStateHint ?? "", /src\/index\.ts|src\\index\.ts/);
});

test("supportsBashBackgroundLifecycle keys off the lifecycle method", () => {
  assert.equal(supportsBashBackgroundLifecycle({ run: async () => ({}) } as any), false);
  const capable = {
    run: async () => ({}),
    runBashWithBackgroundLifecycle: async () => ({ kind: "foreground" }),
  };
  assert.equal(supportsBashBackgroundLifecycle(capable as any), true);
});

test("resolveBashPermissionRulePolicy folds stable action prefixes and falls back to exact", () => {
  const folded = resolveBashPermissionRulePolicy({ command: "npm run lint" });
  const foldedRules = folded?.suggestedPermissionUpdates as any[];
  assert.equal(foldedRules[0].rules[0].ruleContent, "npm run lint:*");

  const highRisk = resolveBashPermissionRulePolicy({ command: "rm -rf build" });
  const exactRules = highRisk?.suggestedPermissionUpdates as any[];
  assert.equal(exactRules[0].rules[0].ruleContent, "rm -rf build");
});

test("selectReadContent slices tail windows and line ranges", () => {
  const tail = selectReadContent("l1\nl2\nl3\n", { filePath: "f", tailLines: 2 });
  assert.equal(tail?.content, "l2\nl3");
  assert.equal(tail?.offset, 2);
  assert.equal(tail?.limit, 2);

  const range = selectReadContent("l1\nl2\nl3\nl4", { filePath: "f", startLine: 2, endLine: 3 });
  assert.equal(range?.content, "l2\nl3");
  assert.equal(range?.offset, 2);

  const whole = selectReadContent("everything", { filePath: "f" });
  assert.equal(whole?.content, "everything");
});

test("collectBashReadFileSources accepts plain reads and rejects piped commands", () => {
  assert.deepEqual(collectBashReadFileSources("cat a.txt"), [{ filePath: "a.txt" }]);
  const head = collectBashReadFileSources("head -n 3 b.txt");
  assert.equal(head[0]?.filePath, "b.txt");
  assert.equal(head[0]?.endLine, 3);
  assert.deepEqual(collectBashReadFileSources("cat a.txt | wc -l"), []);
});
