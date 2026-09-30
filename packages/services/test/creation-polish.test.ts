import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCreationIoFixtureTrace } from "./creation-io-fixture-trace.js";
import { createRunDeadlineClock } from "./creation-run-deadline-clock-fixture.js";
import { createProviderFixtureTrace } from "./creation-provider-fixture-trace.js";
import {
  creationReferenceSlots,
  type CreationJob,
  type CreationJobStatus,
} from "../src/creation/contract.js";

// 仅包装真实存储调用以定位 Windows 的终态等待；不新增 IO、重试或等待层级。
const creationIo = createCreationIoFixtureTrace();
const actualStorage = await import("../src/creation/creationStorage.js");
mock.module("../src/creation/creationStorage.js", {
  namedExports: {
    ...actualStorage,
    writeRecords: (...args: Parameters<typeof actualStorage.writeRecords>) =>
      creationIo.run(args[0], "records.write", () => actualStorage.writeRecords(...args)),
    writeCreationOutput: (...args: Parameters<typeof actualStorage.writeCreationOutput>) =>
      creationIo.run(args[0], "asset.write", () => actualStorage.writeCreationOutput(...args)),
  },
});
const { createCreationService } = await import("../src/creation/creationService.js");

const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const first = Buffer.from([...pngHeader, 1]);
const last = Buffer.from([...pngHeader, 2]);
const mp4 = Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const frame = (name: string, bytes: Buffer) => ({
  name,
  mimeType: "image/png",
  dataBase64: bytes.toString("base64"),
});
const credentials = () => ({
  load: async () => null,
  save: async () => {},
  delete: async () => {},
});
/**
 * 轮询预算与修复前保持一致（100 次 × 10ms ≈ 1000ms）。
 * 依据本规格 R3：不得用放大超时的办法掩盖未解决的状态推进问题，超时必须给出诊断。
 */
export const TERMINAL_BUDGET_MS = 1000;
export const TERMINAL_POLL_MS = 10;
const ACTIVE_STATUSES: readonly CreationJobStatus[] = ["queued", "running"];

export interface TerminalClassification {
  /** 结果语义分类；用于区分“结果明确失败”“结果未知”“用户取消”。 */
  kind: "definite failure" | "unknown result" | "user cancel" | "succeeded" | "still pending";
  /** 是否允许一键重试；unknown result 与 user cancel 一律禁止自动重试。 */
  retry: "allowed" | "forbidden";
}

/** 纯函数：把最后观察到的状态映射为结果语义，避免用单一重试策略覆盖三种不同语义。 */
export function classifyTerminalStatus(
  status: CreationJobStatus | undefined,
): TerminalClassification {
  switch (status) {
    case "failed":
      return { kind: "definite failure", retry: "allowed" };
    case "interrupted":
      return { kind: "unknown result", retry: "forbidden" };
    case "cancelled":
      return { kind: "user cancel", retry: "forbidden" };
    case "succeeded":
      return { kind: "succeeded", retry: "forbidden" };
    default:
      return { kind: "still pending", retry: "forbidden" };
  }
}

/**
 * 纯函数：构造超时诊断。必须携带 taskId、最后观察到的状态、观察到的状态事件与结果分类，
 * 因为旧实现只抛一句 "fixture did not settle"，在 CI 上无法判断是记录缺失、仍在排队还是结果未知。
 */
export function terminalTimeoutDiagnostic(
  taskId: string,
  lastStatus: CreationJobStatus | undefined,
  events: readonly string[],
  budgetMs: number,
): string {
  const classification = classifyTerminalStatus(lastStatus);
  return [
    `fixture did not settle：任务 ${taskId} 在 ${budgetMs}ms 轮询预算内未进入终态。`,
    `最后观察到的状态：${
      lastStatus ?? "从未读到任务记录（job 未持久化，或 rootDir 与创建时不一致）"
    }`,
    `结果分类：${classification.kind}（一键重试：${classification.retry === "allowed" ? "允许" : "禁止"}）`,
    `观察到的状态事件：${events.length > 0 ? events.join(" → ") : "无"}`,
    "语义对照：definite failure=结果明确失败；unknown result=结果未知，可能仍在运行或已计费；user cancel=用户取消。",
  ].join("\n");
}

async function terminal(
  service: Pick<ReturnType<typeof createCreationService>, "getJob">,
  id: string,
  options: {
    budgetMs?: number;
    pollMs?: number;
    pollScheduler?: typeof setTimeout;
    timeoutContext?: () => string;
  } = {},
): Promise<CreationJob> {
  const budgetMs = options.budgetMs ?? TERMINAL_BUDGET_MS;
  const pollMs = options.pollMs ?? TERMINAL_POLL_MS;
  const pollScheduler = options.pollScheduler ?? setTimeout;
  const events: string[] = [];
  let lastStatus: CreationJobStatus | undefined;
  let reads = 0;
  let maxReadMs = 0;
  const startedAt = Date.now();
  for (;;) {
    const readStartedAt = performance.now();
    const job = await service.getJob(id);
    reads++;
    maxReadMs = Math.max(maxReadMs, performance.now() - readStartedAt);
    if (job && job.status !== lastStatus) {
      // 只记录状态变化：轮询会重复读到同一状态，逐次记录会让诊断失去可读性。
      lastStatus = job.status;
      events.push(`${job.status}@${Date.now() - startedAt}ms`);
    }
    if (job && !ACTIVE_STATUSES.includes(job.status)) return job;
    if (Date.now() - startedAt >= budgetMs) break;
    await new Promise((resolve) => pollScheduler(resolve, pollMs));
  }
  // 仅在原预算失败后补充诊断；上下文读取失败不能覆盖原来的超时证据。
  let context: string | undefined;
  try {
    context = options.timeoutContext?.();
  } catch {
    context = "fixture 上下文读取失败";
  }
  throw new Error(
    [
      terminalTimeoutDiagnostic(id, lastStatus, events, budgetMs),
      `getJob reads=${reads}, maxReadMs=${maxReadMs.toFixed(1)}`,
      ...(context ? [context] : []),
    ].join("\n"),
  );
}

function jsonFixtureTrace() {
  const startedAt = performance.now();
  const counts = { "submit:start": 0, "submit:return": 0, "poll:start": 0, "poll:return": 0 };
  const events: string[] = [];
  let checkpointWitnessProviderTaskId = "unobserved";
  return {
    record(stage: keyof typeof counts, taskId?: string) {
      counts[stage]++;
      if (events.length < 16)
        events.push(`${stage}@${(performance.now() - startedAt).toFixed(1)}ms`);
      // publicJob 隐藏 providerTaskId；进入 poll 只能证明前置 checkpoint await 已完成。
      // 未见 poll 不能推断“未持久化”，也不为诊断额外读取私有文件。
      if (stage === "poll:start" && taskId && /^[a-z-]{1,80}$/u.test(taskId))
        checkpointWitnessProviderTaskId = taskId;
    },
    describe: (prompt: string) =>
      `fixture prompt=${prompt}; checkpointWitnessProviderTaskId=${checkpointWitnessProviderTaskId} (poll entry witnesses prior checkpoint completion)\nstages=${JSON.stringify(counts)}; firstEvents=${events.join(" → ")}`,
  };
}

test("terminal timeout reports taskId, last status, observed events and result classification", async () => {
  // 预算保持 1000ms：这是“诚实的预算”，不得通过增大数值来掩盖未解决的状态推进问题。
  assert.equal(TERMINAL_BUDGET_MS, 1000);
  assert.equal(TERMINAL_POLL_MS, 10);

  // 三类结果语义必须可区分，且 unknown result / user cancel 禁止自动重试。
  assert.deepEqual(classifyTerminalStatus("failed"), {
    kind: "definite failure",
    retry: "allowed",
  });
  assert.deepEqual(classifyTerminalStatus("interrupted"), {
    kind: "unknown result",
    retry: "forbidden",
  });
  assert.deepEqual(classifyTerminalStatus("cancelled"), {
    kind: "user cancel",
    retry: "forbidden",
  });

  // 诊断文本本身必须包含 taskId、最后状态、状态事件与分类。
  const diagnostic = terminalTimeoutDiagnostic(
    "job-42",
    "interrupted",
    ["queued@0ms", "running@12ms", "interrupted@530ms"],
    1000,
  );
  assert.match(diagnostic, /job-42/u);
  assert.match(diagnostic, /interrupted/u);
  assert.match(diagnostic, /queued@0ms → running@12ms → interrupted@530ms/u);
  assert.match(diagnostic, /unknown result/u);
  assert.match(diagnostic, /禁止/u);

  // 从未读到记录与“一直处于 running”必须给出不同诊断，而不是同一句笼统失败。
  const missing = terminalTimeoutDiagnostic("job-missing", undefined, [], 1000);
  assert.match(missing, /job-missing/u);
  assert.match(missing, /从未读到任务记录/u);
  assert.match(missing, /still pending/u);
  const running = terminalTimeoutDiagnostic("job-running", "running", ["running@0ms"], 1000);
  assert.match(running, /still pending/u);
  assert.notEqual(missing, running);

  // 真实超时路径：状态一直推进不到终态时，抛出的错误必须携带同一套诊断内容。
  let queued = true;
  const stuck = {
    getJob: async (id: string): Promise<CreationJob> => {
      const status: CreationJobStatus = queued ? "queued" : "running";
      queued = false;
      return {
        id,
        requestId: id,
        kind: "image",
        modelId: "model",
        prompt: "Clip",
        status,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        outputs: [],
      };
    },
  };
  await assert.rejects(terminal(stuck, "job-stuck", { budgetMs: 30, pollMs: 1 }), (error) => {
    assert.match(String(error), /job-stuck/u);
    assert.match(String(error), /最后观察到的状态：queued|最后观察到的状态：running/u);
    // 事件序列为 状态@已用毫秒；毫秒值取决于调度，不断言具体数值。
    assert.match(String(error), /观察到的状态事件：queued@\d+ms → running@\d+ms/u);
    assert.match(String(error), /still pending/u);
    return true;
  });

  // 记录缺失路径：getJob 始终返回 null。
  await assert.rejects(
    terminal({ getJob: async () => null }, "job-absent", { budgetMs: 5, pollMs: 1 }),
    /job-absent[\s\S]*从未读到任务记录/u,
  );

  // 同样的 running 超时须区分未观察到 poll 与已进入 poll，保留原错误及读取证据。
  for (const polled of [false, true]) {
    const trace = jsonFixtureTrace();
    trace.record("submit:start");
    trace.record("submit:return");
    if (polled) {
      trace.record("poll:start", "pending");
      trace.record("poll:return");
    }
    await assert.rejects(
      terminal(stuck, "job-json-stuck", {
        budgetMs: 30,
        pollMs: 1,
        timeoutContext: () => trace.describe("pending"),
      }),
      (error) => {
        const message = String(error);
        assert.match(message, /fixture did not settle.*job-json-stuck/u);
        assert.match(message, /最后观察到的状态：running/u);
        assert.match(message, /getJob reads=[1-9]\d*, maxReadMs=\d+\.\d/u);
        assert.match(message, /fixture prompt=pending/u);
        assert.ok(
          message.includes(`checkpointWitnessProviderTaskId=${polled ? "pending" : "unobserved"}`),
        );
        assert.ok(message.includes(`"poll:start":${polled ? 1 : 0}`));
        assert.match(message, /"submit:start":1,"submit:return":1/u);
        return true;
      },
    );
  }
});

test("reference controls follow each model's explicit placeholders", () => {
  assert.deepEqual(
    creationReferenceSlots({
      kind: "video",
      protocol: "json-api",
      apiMapping: {
        requestPath: "/video",
        requestTemplate: '{"start":"{{firstFrameBase64}}"}',
        outputPath: "asset",
      },
    }),
    { image: false, firstFrame: true, lastFrame: false },
  );
  assert.deepEqual(
    creationReferenceSlots({
      kind: "video",
      protocol: "comfyui",
      workflowJson: '{"a":"{{firstFrame}}","b":"{{lastFrame}}"}',
    }),
    { image: false, firstFrame: true, lastFrame: true },
  );
  assert.deepEqual(
    creationReferenceSlots({
      kind: "video",
      protocol: "json-api",
      apiMapping: {
        requestPath: "/video",
        requestTemplate: '{"prompt":"{{prompt}}"}',
        outputPath: "asset",
      },
    }),
    { image: false, firstFrame: false, lastFrame: false },
  );
});

test("JSON video frames survive a known failure and exactly one parameter-preserving retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-frames-retry-"));
  const io = creationIo.watch(root);
  let submissions = 0;
  const trace = jsonFixtureTrace();
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    fetchImpl: async (_url, init) => {
      // Windows 超时原先缺少提交边界证据；只记阶段，不记请求体、帧字节或私有路径。
      trace.record("submit:start");
      const body = JSON.parse(String(init?.body)) as {
        first: string;
        last: string;
        prompt: string;
      };
      assert.equal(body.first, first.toString("base64"));
      assert.equal(body.last, last.toString("base64"));
      assert.equal(body.prompt, "Clip");
      submissions++;
      const response =
        submissions === 1
          ? new Response("failed", { status: 400 })
          : new Response(JSON.stringify({ asset: mp4.toString("base64") }), {
              headers: { "content-type": "application/json" },
            });
      trace.record("submit:return");
      return response;
    },
  });
  try {
    const model = await service.saveModel({
      name: "Video",
      kind: "video",
      protocol: "json-api",
      baseUrl: "http://127.0.0.1:1",
      model: "fixture",
      enabled: true,
      apiMapping: {
        requestPath: "/video",
        requestTemplate:
          '{"prompt":"{{prompt}}","first":"{{firstFrameBase64}}","last":"{{lastFrameBase64}}"}',
        outputPath: "asset",
      },
    });
    const input = {
      requestId: "video-frames",
      kind: "video" as const,
      modelId: model.id,
      prompt: "Clip",
      firstFrame: frame("first.png", first),
      lastFrame: frame("last.png", last),
    };
    const failed = await terminal(service, (await service.createJob(input)).id, {
      timeoutContext: () => [trace.describe("Clip"), io.describe()].join("\n"),
    });
    assert.equal(failed.status, "failed");
    assert.equal(submissions, 1);
    assert.equal(failed.firstFrameName, "first.png");
    assert.equal(failed.lastFrameName, "last.png");
    assert.equal("firstFramePath" in failed, false);
    const [retried, duplicate] = await Promise.all([
      service.retryJob(failed.id),
      service.retryJob(failed.id),
    ]);
    assert.equal(retried.id, duplicate.id);
    assert.equal(retried.requestId, `retry-${failed.id}`);
    assert.equal(
      (
        await terminal(service, retried.id, {
          timeoutContext: () => [trace.describe("Clip"), io.describe()].join("\n"),
        })
      ).status,
      "succeeded",
    );
    assert.equal(submissions, 2);
    // 健康路径也验证模块包装确实观测到真实落盘，而非只有纯辅助函数通过。
    assert.match(io.describe(), /"asset.write":\{"started":1,"completed":1,"failed":0\}/);
    assert.match(io.describe(), /"records.write":/);
    const reopened = createCreationService({ rootDir: root, credentials: credentials() });
    assert.equal((await reopened.retryJob(failed.id)).id, retried.id);
    assert.equal(submissions, 2);
    await assert.rejects(service.retryJob(retried.id), /仅结果明确失败/);
    await assert.rejects(
      service.createJob({ ...input, lastFrame: frame("other.png", first) }),
      /已用于其他内容/,
    );
  } finally {
    io.release();
    await rm(root, { recursive: true, force: true });
  }
});

test("ComfyUI uploads distinct video frames and substitutes only declared slots", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-comfy-frames-"));
  let uploads = 0;
  let graph: unknown;
  const trace = createProviderFixtureTrace();
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    pollIntervalMs: 1,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/upload/image") {
        trace.record("upload:start");
        uploads++;
        assert(init?.body instanceof FormData);
        assert(init.body.get("image"));
        const response = new Response(JSON.stringify({ name: `uploaded-${uploads}.png` }));
        trace.record("upload:return");
        return response;
      }
      if (path === "/prompt") {
        trace.record("submit:start");
        graph = (JSON.parse(String(init?.body)) as { prompt: unknown }).prompt;
        const response = new Response(JSON.stringify({ prompt_id: "job-1" }));
        trace.record("submit:return");
        return response;
      }
      if (path === "/history/job-1") {
        trace.record("history:start");
        const response = new Response(
          JSON.stringify({
            "job-1": { outputs: { node: { videos: [{ filename: "clip.mp4" }] } } },
          }),
        );
        trace.record("history:return");
        return response;
      }
      if (path === "/view") {
        trace.record("download:start");
        const response = new Response(mp4);
        trace.record("download:return");
        return response;
      }
      throw new Error(`Unexpected fixture path: ${path}`);
    },
  });
  try {
    const model = await service.saveModel({
      name: "Comfy video",
      kind: "video",
      protocol: "comfyui",
      baseUrl: "http://127.0.0.1:1",
      model: "fixture",
      enabled: true,
      workflowJson:
        '{"node":{"class_type":"Video","inputs":{"start":"{{firstFrame}}","end":"{{lastFrame}}"}}}',
    });
    const job = await service.createJob({
      requestId: "comfy-frames",
      kind: "video",
      modelId: model.id,
      prompt: "Clip",
      firstFrame: frame("first.png", first),
      lastFrame: frame("last.png", last),
    });
    assert.equal(
      (await terminal(service, job.id, { timeoutContext: trace.describe })).status,
      "succeeded",
    );
    assert.equal(uploads, 2);
    assert.deepEqual(graph, {
      node: {
        class_type: "Video",
        inputs: {
          start: "uploaded-1.png",
          end: "uploaded-2.png",
        },
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("asynchronous JSON mapping distinguishes completed, failed, timed-out and malformed outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-json-async-"));
  let trace = jsonFixtureTrace();
  let io = creationIo.watch(root);
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    pollIntervalMs: 2,
    providerDeadlineMs: 35,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/submit") {
        trace.record("submit:start");
        const prompt = (JSON.parse(String(init?.body)) as { prompt: string }).prompt;
        const response = new Response(JSON.stringify({ id: prompt }));
        trace.record("submit:return");
        return response;
      }
      if (path.startsWith("/poll/")) {
        const id = path.slice("/poll/".length);
        trace.record("poll:start", id);
        const response = new Response(
          JSON.stringify(
            id === "pending"
              ? { status: "pending" }
              : id === "failure"
                ? { status: "failed" }
                : {
                    status: "completed",
                    asset: id === "invalid" ? "bm90LW1lZGlh" : mp4.toString("base64"),
                  },
          ),
        );
        trace.record("poll:return");
        return response;
      }
      throw new Error(`Unexpected fixture path: ${path}`);
    },
  });
  try {
    const model = await service.saveModel({
      name: "Async",
      kind: "video",
      protocol: "json-api",
      baseUrl: "http://127.0.0.1:1",
      model: "fixture",
      enabled: true,
      apiMapping: {
        requestPath: "/submit",
        requestTemplate: '{"prompt":"{{prompt}}"}',
        outputPath: "asset",
        taskIdPath: "id",
        pollPath: "/poll/{{taskId}}",
        statusPath: "status",
      },
    });
    for (const [prompt, expected] of [
      ["good", "succeeded"],
      ["failure", "failed"],
      ["pending", "interrupted"],
      ["invalid", "failed"],
    ] as const) {
      trace = jsonFixtureTrace();
      io.release();
      io = creationIo.watch(root);
      const job = await service.createJob({
        requestId: prompt,
        kind: "video",
        modelId: model.id,
        prompt,
      });
      assert.equal(
        (
          await terminal(service, job.id, {
            timeoutContext: () => [trace.describe(prompt), io.describe()].join("\n"),
          })
        ).status,
        expected,
        prompt,
      );
    }
  } finally {
    io.release();
    await rm(root, { recursive: true, force: true });
  }
});

test("unsupported frame, timeout, cancel and unknown result never become retryable failures", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-unknown-"));
  let submissions = 0;
  const submitted = Promise.withResolvers<void>();
  const deadlineMs = 40;
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    runTimeoutMs: deadlineMs,
    fetchImpl: async (_url, init) => {
      submissions++;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason ?? new Error("aborted")),
          { once: true },
        );
        submitted.resolve();
      });
    },
  });
  try {
    const model = await service.saveModel({
      name: "Video",
      kind: "video",
      protocol: "json-api",
      baseUrl: "http://127.0.0.1:1",
      model: "fixture",
      enabled: true,
      apiMapping: {
        requestPath: "/video",
        requestTemplate: '{"prompt":"{{prompt}}"}',
        outputPath: "asset",
      },
    });
    await assert.rejects(
      service.createJob({
        requestId: "unsupported",
        kind: "video",
        modelId: model.id,
        prompt: "Clip",
        firstFrame: frame("first.png", first),
      }),
      /未配置首帧/,
    );
    // Windows CI 可能在 40ms 内尚未完成初始写盘；只有实际提交后超时才是未知结果。
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const timedJob = await service.createJob({
      requestId: "timeout",
      kind: "video",
      modelId: model.id,
      prompt: "Clip",
    });
    await submitted.promise;
    t.mock.timers.tick(deadlineMs);
    t.mock.timers.reset();
    const unknown = await terminal(service, timedJob.id);
    assert.equal(unknown.status, "interrupted");
    assert.match(unknown.error ?? "", /可能继续运行或计费/);
    assert.equal(
      (
        await service.createJob({
          requestId: "timeout",
          kind: "video",
          modelId: model.id,
          prompt: "Clip",
        })
      ).id,
      unknown.id,
    );
    assert.equal(submissions, 1);
    await assert.rejects(service.retryJob(unknown.id), /仅结果明确失败/);
    // 本分支验证用户取消，不让真实截止时间与取消操作竞争。
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pending = await service.createJob({
      requestId: "cancel",
      kind: "video",
      modelId: model.id,
      prompt: "Clip",
    });
    assert.equal((await service.cancelJob(pending.id)).status, "cancelled");
    await assert.rejects(service.retryJob(pending.id), /仅结果明确失败/);
  } finally {
    t.mock.timers.reset();
    await rm(root, { recursive: true, force: true });
  }
});

test("a server error after submission is uncertain, so it cannot trigger a paid one-click retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-5xx-"));
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    fetchImpl: async () => new Response("server error", { status: 503 }),
  });
  try {
    const model = await service.saveModel({
      name: "Video",
      kind: "video",
      protocol: "json-api",
      baseUrl: "http://127.0.0.1:1",
      model: "fixture",
      enabled: true,
      apiMapping: {
        requestPath: "/video",
        requestTemplate: '{"prompt":"{{prompt}}"}',
        outputPath: "asset",
      },
    });
    const job = await service.createJob({
      requestId: "server-error",
      kind: "video",
      modelId: model.id,
      prompt: "Clip",
    });
    assert.equal((await terminal(service, job.id)).status, "interrupted");
    await assert.rejects(service.retryJob(job.id), /仅结果明确失败/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retry rejects a changed or redirected private frame instead of forwarding its bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-frame-integrity-"));
  let submissions = 0;
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    fetchImpl: async () => {
      submissions++;
      return new Response("rejected", { status: 400 });
    },
  });
  try {
    const model = await service.saveModel({
      name: "Video",
      kind: "video",
      protocol: "json-api",
      baseUrl: "http://127.0.0.1:1",
      model: "fixture",
      enabled: true,
      apiMapping: {
        requestPath: "/video",
        requestTemplate: '{"first":"{{firstFrameBase64}}"}',
        outputPath: "asset",
      },
    });
    const failed = await terminal(
      service,
      (
        await service.createJob({
          requestId: "integrity",
          kind: "video",
          modelId: model.id,
          prompt: "Clip",
          firstFrame: frame("first.png", first),
        })
      ).id,
    );
    const jobsPath = join(root, "jobs.json");
    const stored = JSON.parse(await readFile(jobsPath, "utf8")) as {
      items: Array<{ firstFramePath: string }>;
    };
    const originalPath = stored.items[0]!.firstFramePath;
    await writeFile(originalPath, last);
    await assert.rejects(service.retryJob(failed.id), /已变化/);
    await writeFile(originalPath, first);
    const outside = join(root, "outside.png");
    await writeFile(outside, first);
    stored.items[0]!.firstFramePath = outside;
    await writeFile(jobsPath, JSON.stringify(stored));
    await assert.rejects(service.retryJob(failed.id), /不属于创作数据目录/);
    assert.equal(submissions, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const protocol of ["openai-images", "comfyui", "json-api"] as const) {
  test(`${protocol} classifies known failure, retry, timeout and cancellation offline`, async () => {
    const root = await mkdtemp(join(tmpdir(), `knorvia-${protocol}-states-`));
    const keys = new Map<string, string>();
    const clock = createRunDeadlineClock();
    // 真实看门狗独立于被测截止时间；慢磁盘不能决定“提交后超时/取消”的先后顺序。
    const realSetTimeout = setTimeout;
    const realClearTimeout = clearTimeout;
    let submissionEntered = Promise.withResolvers<void>();
    const waitForSubmission = async (jobId: string) => {
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          submissionEntered.promise,
          new Promise<never>((_resolve, reject) => {
            watchdog = realSetTimeout(
              () =>
                reject(
                  new Error(
                    `任务 ${jobId} 在 ${TERMINAL_BUDGET_MS}ms 内未进入模拟供应商；已提交 ${submissions} 次`,
                  ),
                ),
              TERMINAL_BUDGET_MS,
            );
          }),
        ]);
      } finally {
        realClearTimeout(watchdog);
      }
    };
    let mode: "known-fail" | "success" | "hang" = "known-fail";
    let submissions = 0;
    const service = createCreationService({
      rootDir: root,
      runTimeoutMs: 500,
      scheduleRunDeadline: clock.scheduleRunDeadline,
      pollIntervalMs: 1,
      credentials: {
        load: async (key) => keys.get(key) ?? null,
        save: async (key, value) => {
          keys.set(key, value);
        },
        delete: async (key) => {
          keys.delete(key);
        },
      },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === "/history/task")
          return new Response(
            JSON.stringify({
              task: { outputs: { node: { images: [{ filename: "image.png" }] } } },
            }),
          );
        if (path === "/view") return new Response(first);
        submissions++;
        if (mode === "hang") {
          init?.signal?.throwIfAborted();
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason ?? new Error("aborted")),
              { once: true },
            );
            submissionEntered.resolve();
          });
        }
        if (mode === "known-fail") return new Response("failed", { status: 400 });
        const result =
          protocol === "openai-images"
            ? { data: [{ b64_json: first.toString("base64") }] }
            : protocol === "comfyui"
              ? { prompt_id: "task" }
              : { asset: first.toString("base64") };
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    });
    try {
      const model = await service.saveModel({
        name: protocol,
        kind: "image",
        protocol,
        baseUrl: "http://127.0.0.1:1",
        model: "fixture",
        enabled: true,
        apiKey: protocol === "openai-images" ? "fixture-only-key" : undefined,
        ...(protocol === "comfyui"
          ? { workflowJson: '{"node":{"class_type":"Image","inputs":{"text":"{{prompt}}"}}}' }
          : {}),
        ...(protocol === "json-api"
          ? {
              apiMapping: {
                requestPath: "/generate",
                requestTemplate: '{"prompt":"{{prompt}}"}',
                outputPath: "asset",
              },
            }
          : {}),
      });
      const request = (requestId: string) => ({
        requestId,
        kind: "image" as const,
        modelId: model.id,
        prompt: "Frame",
      });
      // 提交前超时也会是 failed；只控制业务截止并检查 400，避免把它误作供应商拒绝。
      // 持久化退避与终态轮询仍走真实计时器，原来的 1000ms 验收预算不变。
      const pollOptions = { pollScheduler: realSetTimeout };
      const failed = await terminal(
        service,
        (await service.createJob(request("failed"))).id,
        pollOptions,
      );
      assert.equal(failed.status, "failed");
      assert.match(failed.error ?? "", /生成服务返回 400/);
      assert.equal(submissions, 1);
      mode = "success";
      const retried = await service.retryJob(failed.id);
      assert.equal((await terminal(service, retried.id, pollOptions)).status, "succeeded");
      assert.equal(submissions, 2);
      mode = "hang";
      // 先确认已提交，再推进原来的 500ms 业务截止；真实 IO 计时器始终正常运行。
      const timeoutJob = await service.createJob(request("timeout"));
      await waitForSubmission(timeoutJob.id);
      clock.advanceBy(500);
      const timedOut = await terminal(service, timeoutJob.id);
      assert.equal(timedOut.status, "interrupted");
      await assert.rejects(service.retryJob(timedOut.id), /仅结果明确失败/);
      // 取消用独立的到达信号，不推进业务时钟，避免用户取消与截止竞速。
      submissionEntered = Promise.withResolvers<void>();
      const cancelling = await service.createJob(request("cancel"));
      await waitForSubmission(cancelling.id);
      assert.equal(submissions, 4);
      const cancelled = await service.cancelJob(cancelling.id);
      assert.equal(cancelled.status, "cancelled");
      assert.match(cancelled.error ?? "", /可能继续运行或计费/);
      await assert.rejects(service.retryJob(cancelled.id), /仅结果明确失败/);
      assert.equal(submissions, 4);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
