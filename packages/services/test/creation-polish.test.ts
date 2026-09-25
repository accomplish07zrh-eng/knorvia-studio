import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCreationService } from "../src/creation/creationService.js";
import {
  creationReferenceSlots,
  type CreationJob,
  type CreationJobStatus,
} from "../src/creation/contract.js";

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
  options: { budgetMs?: number; pollMs?: number } = {},
): Promise<CreationJob> {
  const budgetMs = options.budgetMs ?? TERMINAL_BUDGET_MS;
  const pollMs = options.pollMs ?? TERMINAL_POLL_MS;
  const events: string[] = [];
  let lastStatus: CreationJobStatus | undefined;
  const startedAt = Date.now();
  for (;;) {
    const job = await service.getJob(id);
    if (job && job.status !== lastStatus) {
      // 只记录状态变化：轮询会重复读到同一状态，逐次记录会让诊断失去可读性。
      lastStatus = job.status;
      events.push(`${job.status}@${Date.now() - startedAt}ms`);
    }
    if (job && !ACTIVE_STATUSES.includes(job.status)) return job;
    if (Date.now() - startedAt >= budgetMs) break;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(terminalTimeoutDiagnostic(id, lastStatus, events, budgetMs));
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
  let submissions = 0;
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        first: string;
        last: string;
        prompt: string;
      };
      assert.equal(body.first, first.toString("base64"));
      assert.equal(body.last, last.toString("base64"));
      assert.equal(body.prompt, "Clip");
      submissions++;
      return submissions === 1
        ? new Response("failed", { status: 400 })
        : new Response(JSON.stringify({ asset: mp4.toString("base64") }), {
            headers: { "content-type": "application/json" },
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
    const failed = await terminal(service, (await service.createJob(input)).id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.firstFrameName, "first.png");
    assert.equal(failed.lastFrameName, "last.png");
    assert.equal("firstFramePath" in failed, false);
    const [retried, duplicate] = await Promise.all([
      service.retryJob(failed.id),
      service.retryJob(failed.id),
    ]);
    assert.equal(retried.id, duplicate.id);
    assert.equal(retried.requestId, `retry-${failed.id}`);
    assert.equal((await terminal(service, retried.id)).status, "succeeded");
    assert.equal(submissions, 2);
    const reopened = createCreationService({ rootDir: root, credentials: credentials() });
    assert.equal((await reopened.retryJob(failed.id)).id, retried.id);
    assert.equal(submissions, 2);
    await assert.rejects(service.retryJob(retried.id), /仅结果明确失败/);
    await assert.rejects(
      service.createJob({ ...input, lastFrame: frame("other.png", first) }),
      /已用于其他内容/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ComfyUI uploads distinct video frames and substitutes only declared slots", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-comfy-frames-"));
  let uploads = 0;
  let graph: unknown;
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    pollIntervalMs: 1,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/upload/image") {
        uploads++;
        assert(init?.body instanceof FormData);
        assert(init.body.get("image"));
        return new Response(JSON.stringify({ name: `uploaded-${uploads}.png` }));
      }
      if (path === "/prompt") {
        graph = (JSON.parse(String(init?.body)) as { prompt: unknown }).prompt;
        return new Response(JSON.stringify({ prompt_id: "job-1" }));
      }
      if (path === "/history/job-1")
        return new Response(
          JSON.stringify({
            "job-1": { outputs: { node: { videos: [{ filename: "clip.mp4" }] } } },
          }),
        );
      if (path === "/view") return new Response(mp4);
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
    assert.equal((await terminal(service, job.id)).status, "succeeded");
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
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    pollIntervalMs: 2,
    providerDeadlineMs: 35,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/submit") {
        const prompt = (JSON.parse(String(init?.body)) as { prompt: string }).prompt;
        return new Response(JSON.stringify({ id: prompt }));
      }
      if (path.startsWith("/poll/")) {
        const id = path.slice("/poll/".length);
        return new Response(
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
      const job = await service.createJob({
        requestId: prompt,
        kind: "video",
        modelId: model.id,
        prompt,
      });
      assert.equal((await terminal(service, job.id)).status, expected, prompt);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unsupported frame, timeout, cancel and unknown result never become retryable failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-unknown-"));
  let submissions = 0;
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    runTimeoutMs: 40,
    fetchImpl: async (_url, init) => {
      submissions++;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason ?? new Error("aborted")),
          { once: true },
        );
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
    const unknown = await terminal(
      service,
      (
        await service.createJob({
          requestId: "timeout",
          kind: "video",
          modelId: model.id,
          prompt: "Clip",
        })
      ).id,
    );
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
    const pending = await service.createJob({
      requestId: "cancel",
      kind: "video",
      modelId: model.id,
      prompt: "Clip",
    });
    assert.equal((await service.cancelJob(pending.id)).status, "cancelled");
    await assert.rejects(service.retryJob(pending.id), /仅结果明确失败/);
  } finally {
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
    let mode: "known-fail" | "success" | "hang" = "known-fail";
    let submissions = 0;
    const service = createCreationService({
      rootDir: root,
      runTimeoutMs: 500,
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
        if (mode === "hang")
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason ?? new Error("aborted")),
              { once: true },
            );
          });
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
      const failed = await terminal(service, (await service.createJob(request("failed"))).id);
      assert.equal(failed.status, "failed");
      mode = "success";
      const retried = await service.retryJob(failed.id);
      assert.equal((await terminal(service, retried.id)).status, "succeeded");
      mode = "hang";
      const timedOut = await terminal(service, (await service.createJob(request("timeout"))).id);
      assert.equal(timedOut.status, "interrupted");
      await assert.rejects(service.retryJob(timedOut.id), /仅结果明确失败/);
      const cancelling = await service.createJob(request("cancel"));
      for (let i = 0; i < 100 && submissions < 4; i++)
        await new Promise((resolve) => setTimeout(resolve, 5));
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
