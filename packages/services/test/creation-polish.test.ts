import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCreationService } from "../src/creation/creationService.js";
import { creationReferenceSlots, type CreationJob } from "../src/creation/contract.js";

const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const first = Buffer.from([...pngHeader, 1]);
const last = Buffer.from([...pngHeader, 2]);
const mp4 = Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const frame = (name: string, bytes: Buffer) => ({
  name, mimeType: "image/png", dataBase64: bytes.toString("base64"),
});
const credentials = () => ({
  load: async () => null, save: async () => {}, delete: async () => {},
});
async function terminal(service: ReturnType<typeof createCreationService>, id: string): Promise<CreationJob> {
  for (let i = 0; i < 100; i++) {
    const job = await service.getJob(id);
    if (job && !["queued", "running"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("fixture did not settle");
}

test("reference controls follow each model's explicit placeholders", () => {
  assert.deepEqual(creationReferenceSlots({ kind: "video", protocol: "json-api", apiMapping: {
    requestPath: "/video", requestTemplate: '{"start":"{{firstFrameBase64}}"}', outputPath: "asset",
  } }), { image: false, firstFrame: true, lastFrame: false });
  assert.deepEqual(creationReferenceSlots({ kind: "video", protocol: "comfyui", workflowJson: '{"a":"{{firstFrame}}","b":"{{lastFrame}}"}' }),
    { image: false, firstFrame: true, lastFrame: true });
  assert.deepEqual(creationReferenceSlots({ kind: "video", protocol: "json-api", apiMapping: {
    requestPath: "/video", requestTemplate: '{"prompt":"{{prompt}}"}', outputPath: "asset",
  } }), { image: false, firstFrame: false, lastFrame: false });
});

test("JSON video frames survive a known failure and exactly one parameter-preserving retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-frames-retry-"));
  let submissions = 0;
  const service = createCreationService({ rootDir: root, credentials: credentials(),
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { first: string; last: string; prompt: string };
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
      name: "Video", kind: "video", protocol: "json-api", baseUrl: "http://127.0.0.1:1",
      model: "fixture", enabled: true, apiMapping: {
        requestPath: "/video", requestTemplate: '{"prompt":"{{prompt}}","first":"{{firstFrameBase64}}","last":"{{lastFrameBase64}}"}',
        outputPath: "asset",
      },
    });
    const input = { requestId: "video-frames", kind: "video" as const, modelId: model.id,
      prompt: "Clip", firstFrame: frame("first.png", first), lastFrame: frame("last.png", last) };
    const failed = await terminal(service, (await service.createJob(input)).id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.firstFrameName, "first.png");
    assert.equal(failed.lastFrameName, "last.png");
    assert.equal("firstFramePath" in failed, false);
    const [retried, duplicate] = await Promise.all([service.retryJob(failed.id), service.retryJob(failed.id)]);
    assert.equal(retried.id, duplicate.id);
    assert.equal(retried.requestId, `retry-${failed.id}`);
    assert.equal((await terminal(service, retried.id)).status, "succeeded");
    assert.equal(submissions, 2);
    const reopened = createCreationService({ rootDir: root, credentials: credentials() });
    assert.equal((await reopened.retryJob(failed.id)).id, retried.id);
    assert.equal(submissions, 2);
    await assert.rejects(service.retryJob(retried.id), /仅结果明确失败/);
    await assert.rejects(service.createJob({ ...input, lastFrame: frame("other.png", first) }), /已用于其他内容/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ComfyUI uploads distinct video frames and substitutes only declared slots", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-comfy-frames-"));
  let uploads = 0;
  let graph: unknown;
  const service = createCreationService({ rootDir: root, credentials: credentials(), pollIntervalMs: 1,
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
        return new Response(JSON.stringify({ "job-1": { outputs: { node: { videos: [{ filename: "clip.mp4" }] } } } }));
      if (path === "/view") return new Response(mp4);
      throw new Error(`Unexpected fixture path: ${path}`);
    },
  });
  try {
    const model = await service.saveModel({ name: "Comfy video", kind: "video", protocol: "comfyui",
      baseUrl: "http://127.0.0.1:1", model: "fixture", enabled: true,
      workflowJson: '{"node":{"class_type":"Video","inputs":{"start":"{{firstFrame}}","end":"{{lastFrame}}"}}}',
    });
    const job = await service.createJob({ requestId: "comfy-frames", kind: "video", modelId: model.id,
      prompt: "Clip", firstFrame: frame("first.png", first), lastFrame: frame("last.png", last) });
    assert.equal((await terminal(service, job.id)).status, "succeeded");
    assert.equal(uploads, 2);
    assert.deepEqual(graph, { node: { class_type: "Video", inputs: {
      start: "uploaded-1.png", end: "uploaded-2.png",
    } } });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("asynchronous JSON mapping distinguishes completed, failed, timed-out and malformed outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-json-async-"));
  const service = createCreationService({ rootDir: root, credentials: credentials(),
    pollIntervalMs: 2, providerDeadlineMs: 35,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/submit") {
        const prompt = (JSON.parse(String(init?.body)) as { prompt: string }).prompt;
        return new Response(JSON.stringify({ id: prompt }));
      }
      if (path.startsWith("/poll/")) {
        const id = path.slice("/poll/".length);
        return new Response(JSON.stringify(id === "pending"
          ? { status: "pending" }
          : id === "failure"
            ? { status: "failed" }
            : { status: "completed", asset: id === "invalid" ? "bm90LW1lZGlh" : mp4.toString("base64") }));
      }
      throw new Error(`Unexpected fixture path: ${path}`);
    },
  });
  try {
    const model = await service.saveModel({ name: "Async", kind: "video", protocol: "json-api",
      baseUrl: "http://127.0.0.1:1", model: "fixture", enabled: true,
      apiMapping: { requestPath: "/submit", requestTemplate: '{"prompt":"{{prompt}}"}',
        outputPath: "asset", taskIdPath: "id", pollPath: "/poll/{{taskId}}", statusPath: "status" },
    });
    for (const [prompt, expected] of [
      ["good", "succeeded"], ["failure", "failed"],
      ["pending", "interrupted"], ["invalid", "failed"],
    ] as const) {
      const job = await service.createJob({ requestId: prompt, kind: "video", modelId: model.id, prompt });
      assert.equal((await terminal(service, job.id)).status, expected, prompt);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unsupported frame, timeout, cancel and unknown result never become retryable failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-unknown-"));
  let submissions = 0;
  const service = createCreationService({ rootDir: root, credentials: credentials(), runTimeoutMs: 40,
    fetchImpl: async (_url, init) => {
      submissions++;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")), { once: true });
      });
    },
  });
  try {
    const model = await service.saveModel({ name: "Video", kind: "video", protocol: "json-api",
      baseUrl: "http://127.0.0.1:1", model: "fixture", enabled: true,
      apiMapping: { requestPath: "/video", requestTemplate: '{"prompt":"{{prompt}}"}', outputPath: "asset" },
    });
    await assert.rejects(service.createJob({ requestId: "unsupported", kind: "video", modelId: model.id,
      prompt: "Clip", firstFrame: frame("first.png", first) }), /未配置首帧/);
    const unknown = await terminal(service, (await service.createJob({ requestId: "timeout", kind: "video",
      modelId: model.id, prompt: "Clip" })).id);
    assert.equal(unknown.status, "interrupted");
    assert.match(unknown.error ?? "", /可能继续运行或计费/);
    assert.equal((await service.createJob({ requestId: "timeout", kind: "video", modelId: model.id, prompt: "Clip" })).id, unknown.id);
    assert.equal(submissions, 1);
    await assert.rejects(service.retryJob(unknown.id), /仅结果明确失败/);
    const pending = await service.createJob({ requestId: "cancel", kind: "video", modelId: model.id, prompt: "Clip" });
    assert.equal((await service.cancelJob(pending.id)).status, "cancelled");
    await assert.rejects(service.retryJob(pending.id), /仅结果明确失败/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a server error after submission is uncertain, so it cannot trigger a paid one-click retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-5xx-"));
  const service = createCreationService({ rootDir: root, credentials: credentials(),
    fetchImpl: async () => new Response("server error", { status: 503 }),
  });
  try {
    const model = await service.saveModel({ name: "Video", kind: "video", protocol: "json-api",
      baseUrl: "http://127.0.0.1:1", model: "fixture", enabled: true,
      apiMapping: { requestPath: "/video", requestTemplate: '{"prompt":"{{prompt}}"}', outputPath: "asset" },
    });
    const job = await service.createJob({ requestId: "server-error", kind: "video", modelId: model.id, prompt: "Clip" });
    assert.equal((await terminal(service, job.id)).status, "interrupted");
    await assert.rejects(service.retryJob(job.id), /仅结果明确失败/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retry rejects a changed or redirected private frame instead of forwarding its bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-frame-integrity-"));
  let submissions = 0;
  const service = createCreationService({ rootDir: root, credentials: credentials(),
    fetchImpl: async () => { submissions++; return new Response("rejected", { status: 400 }); },
  });
  try {
    const model = await service.saveModel({ name: "Video", kind: "video", protocol: "json-api",
      baseUrl: "http://127.0.0.1:1", model: "fixture", enabled: true,
      apiMapping: { requestPath: "/video", requestTemplate: '{"first":"{{firstFrameBase64}}"}', outputPath: "asset" },
    });
    const failed = await terminal(service, (await service.createJob({ requestId: "integrity", kind: "video",
      modelId: model.id, prompt: "Clip", firstFrame: frame("first.png", first) })).id);
    const jobsPath = join(root, "jobs.json");
    const stored = JSON.parse(await readFile(jobsPath, "utf8")) as { items: Array<{ firstFramePath: string }> };
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
    const service = createCreationService({ rootDir: root, runTimeoutMs: 500, pollIntervalMs: 1,
      credentials: {
        load: async (key) => keys.get(key) ?? null,
        save: async (key, value) => { keys.set(key, value); },
        delete: async (key) => { keys.delete(key); },
      },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === "/history/task")
          return new Response(JSON.stringify({ task: { outputs: { node: { images: [{ filename: "image.png" }] } } } }));
        if (path === "/view") return new Response(first);
        submissions++;
        if (mode === "hang")
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")), { once: true });
          });
        if (mode === "known-fail") return new Response("failed", { status: 400 });
        const result = protocol === "openai-images"
          ? { data: [{ b64_json: first.toString("base64") }] }
          : protocol === "comfyui"
            ? { prompt_id: "task" }
            : { asset: first.toString("base64") };
        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
      },
    });
    try {
      const model = await service.saveModel({ name: protocol, kind: "image", protocol,
        baseUrl: "http://127.0.0.1:1", model: "fixture", enabled: true,
        apiKey: protocol === "openai-images" ? "fixture-only-key" : undefined,
        ...(protocol === "comfyui" ? { workflowJson: '{"node":{"class_type":"Image","inputs":{"text":"{{prompt}}"}}}' } : {}),
        ...(protocol === "json-api" ? { apiMapping: {
          requestPath: "/generate", requestTemplate: '{"prompt":"{{prompt}}"}', outputPath: "asset",
        } } : {}),
      });
      const request = (requestId: string) => ({ requestId, kind: "image" as const, modelId: model.id, prompt: "Frame" });
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
