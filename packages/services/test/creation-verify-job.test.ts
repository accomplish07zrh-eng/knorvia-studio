import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { CreationJob } from "../src/creation/contract.js";
import { createCreationService } from "../src/creation/creationService.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=",
  "base64",
);
const pngHash = createHash("sha256").update(png).digest("hex");

function credentials() {
  const secrets = new Map<string, string>();
  return {
    async load(key: string) {
      return secrets.get(key) ?? null;
    },
    async save(key: string, value: string) {
      secrets.set(key, value);
    },
    async delete(key: string) {
      secrets.delete(key);
    },
  };
}

async function terminal(
  service: ReturnType<typeof createCreationService>,
  id: string,
): Promise<CreationJob> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const job = await service.getJob(id);
    if (job && !["queued", "running"].includes(job.status)) return job;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error("Creation job did not finish");
}

const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

const comfyWorkflow = '{"node":{"class_type":"Image","inputs":{"text":"{{prompt}}"}}}';

type ComfyHistoryState = "empty" | "running" | "output" | "error" | "server-error";

function comfyService(root: string, state: { history: ComfyHistoryState }, requests: string[]) {
  return createCreationService({
    rootDir: root,
    credentials: credentials(),
    pollIntervalMs: 1,
    providerDeadlineMs: 40,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      requests.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/prompt") return json({ prompt_id: "task-1" });
      if (path === "/history/task-1") {
        if (state.history === "server-error") return new Response("server error", { status: 503 });
        if (state.history === "error")
          return json({ "task-1": { status: { status_str: "error" } } });
        if (state.history === "running")
          return json({ "task-1": { status: { status_str: "running", completed: false } } });
        if (state.history === "output")
          return json({
            "task-1": { outputs: { node: { images: [{ filename: "image.png" }] } } },
          });
        return json({});
      }
      if (path === "/view") return new Response(png);
      throw new Error(`Unexpected fixture path: ${path}`);
    },
  });
}

function posts(requests: readonly string[]): number {
  return requests.filter((entry) => entry.startsWith("POST")).length;
}

test("verifyJob resolves a ComfyUI unknown result only after a read-only history query", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-verify-comfy-"));
  const requests: string[] = [];
  const state: { history: ComfyHistoryState } = { history: "empty" };
  const service = comfyService(root, state, requests);
  try {
    const model = await service.saveModel({
      name: "Comfy image",
      kind: "image",
      protocol: "comfyui",
      baseUrl: "http://127.0.0.1:1",
      model: "fixture",
      enabled: true,
      workflowJson: comfyWorkflow,
    });
    const job = await service.createJob({
      requestId: "comfy-verify",
      kind: "image",
      modelId: model.id,
      prompt: "Recover",
    });
    const interrupted = await terminal(service, job.id);
    assert.equal(interrupted.status, "interrupted");
    assert.match(interrupted.error ?? "", /可能继续运行或计费|结果未知/);
    // 私有任务编号不对外暴露，但已经被持久化，供验证使用。
    assert.equal("providerTaskId" in interrupted, false);
    assert.equal(posts(requests), 1);
    // 远端没有该任务的历史记录：保持中断，只写 checkedAt 与诚实说明。
    const missing = await service.verifyJob(job.id);
    assert.equal(missing.outcome, "unknown");
    assert.equal(missing.job.status, "interrupted");
    assert.equal(missing.job.checkedAt, missing.checkedAt);
    assert.match(missing.message, /没有返回该任务的历史记录/);
    assert.equal(missing.job.outputs.length, 0);
    // 历史记录存在但仍在运行：消息必须区分“尚未结束”，不能冒充结果。
    state.history = "running";
    const running = await service.verifyJob(job.id);
    assert.equal(running.outcome, "unknown");
    assert.equal(running.job.status, "interrupted");
    assert.match(running.message, /尚未结束/);
    // 远端确认成功后，恢复成果并置为 succeeded。
    state.history = "output";
    const second = await service.verifyJob(job.id);
    assert.equal(second.outcome, "succeeded");
    assert.equal(second.job.status, "succeeded");
    assert.equal(second.job.error, undefined);
    assert.equal(second.job.outputs[0]?.mimeType, "image/png");
    assert.equal(second.job.outputs[0]?.hash, pngHash);
    assert.equal(second.job.outputs[0]?.size, png.byteLength);
    assert.deepEqual(await readFile(second.job.outputs[0]!.path), png);
    assert.equal(second.job.checkedAt, second.checkedAt);
    // 两条验证路径都只读：没有产生第二次供应商提交。
    assert.equal(posts(requests), 1);
    assert.equal(requests.at(-1), "GET /view");
    await assert.rejects(service.verifyJob(job.id), /无需验证/);
    assert.equal(posts(requests), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verifyJob turns a confirmed ComfyUI failure into a retryable failed job", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-verify-comfy-fail-"));
  const requests: string[] = [];
  const state: { history: ComfyHistoryState } = { history: "empty" };
  const service = comfyService(root, state, requests);
  try {
    const model = await service.saveModel({
      name: "Comfy image",
      kind: "image",
      protocol: "comfyui",
      baseUrl: "http://127.0.0.1:1",
      model: "fixture",
      enabled: true,
      workflowJson: comfyWorkflow,
    });
    const job = await service.createJob({
      requestId: "comfy-confirmed-failure",
      kind: "image",
      modelId: model.id,
      prompt: "Fail",
    });
    assert.equal((await terminal(service, job.id)).status, "interrupted");
    // 远端 5xx 只代表结果未知，不得改判为失败。
    state.history = "server-error";
    const uncertain = await service.verifyJob(job.id);
    assert.equal(uncertain.outcome, "unknown");
    assert.equal(uncertain.job.status, "interrupted");
    assert.match(uncertain.message, /结果仍未知/);
    state.history = "error";
    const failed = await service.verifyJob(job.id);
    assert.equal(failed.outcome, "failed");
    assert.equal(failed.job.status, "failed");
    assert.equal(failed.job.checkedAt, failed.checkedAt);
    assert.match(failed.message, /失败/);
    assert.equal(posts(requests), 1);
    // 只有确认失败之后，一键重试才是安全的。
    const retried = await service.retryJob(job.id);
    assert.equal(retried.requestId, `retry-${job.id}`);
    assert.deepEqual(retried.provenance, {
      parentJobId: job.id,
      repeatOfRequestId: job.requestId,
    });
    assert.equal((await terminal(service, retried.id)).status, "failed");
    assert.equal(posts(requests), 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verifyJob follows the JSON API poll path and never POSTs a second submission", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-verify-json-"));
  const requests: string[] = [];
  let polled: "pending" | "completed" = "pending";
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    pollIntervalMs: 1,
    providerDeadlineMs: 40,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      requests.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/submit") return json({ id: "poll-1" });
      if (path === "/poll/poll-1")
        return json(
          polled === "completed"
            ? { status: "completed", asset: png.toString("base64") }
            : { status: "pending" },
        );
      throw new Error(`Unexpected fixture path: ${path}`);
    },
  });
  try {
    const model = await service.saveModel({
      name: "Async video",
      kind: "image",
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
    const request = (requestId: string) => ({
      requestId,
      kind: "image" as const,
      modelId: model.id,
      prompt: "Poll",
    });
    const pending = await service.createJob(request("json-pending"));
    assert.equal((await terminal(service, pending.id)).status, "interrupted");
    const unknown = await service.verifyJob(pending.id);
    assert.equal(unknown.outcome, "unknown");
    assert.equal(unknown.job.status, "interrupted");
    assert.match(unknown.message, /pending|仍未知/);
    const finished = await service.createJob(request("json-finished"));
    assert.equal((await terminal(service, finished.id)).status, "interrupted");
    polled = "completed";
    const verified = await service.verifyJob(finished.id);
    assert.equal(verified.outcome, "succeeded");
    assert.equal(verified.job.status, "succeeded");
    assert.equal(verified.job.outputs[0]?.hash, pngHash);
    assert.deepEqual(await readFile(verified.job.outputs[0]!.path), png);
    // 两个任务各提交一次，验证路径没有新增任何 POST。
    assert.equal(posts(requests), 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verifyJob reports an explicit cannot-verify result without a query capability", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-verify-unsupported-"));
  const requests: string[] = [];
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    runTimeoutMs: 40,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      requests.push(`${init?.method ?? "GET"} ${path}`);
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
    const openai = await service.saveModel({
      name: "OpenAI image",
      kind: "image",
      protocol: "openai-images",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "fixture",
      enabled: true,
      apiKey: "fixture-only-key",
    });
    const sync = await service.saveModel({
      name: "Sync JSON image",
      kind: "image",
      protocol: "json-api",
      baseUrl: "http://127.0.0.1:1",
      model: "fixture",
      enabled: true,
      apiMapping: {
        requestPath: "/generate",
        requestTemplate: '{"prompt":"{{prompt}}"}',
        outputPath: "asset",
      },
    });
    const openaiJob = await service.createJob({
      requestId: "openai-unknown",
      kind: "image",
      modelId: openai.id,
      prompt: "Unknown",
    });
    assert.equal((await terminal(service, openaiJob.id)).status, "interrupted");
    const cannotVerify = await service.verifyJob(openaiJob.id);
    assert.equal(cannotVerify.outcome, "unsupported");
    assert.equal(cannotVerify.job.status, "interrupted");
    assert.equal(cannotVerify.job.checkedAt, cannotVerify.checkedAt);
    assert.match(cannotVerify.message, /无法远程验证/);
    const syncJob = await service.createJob({
      requestId: "sync-unknown",
      kind: "image",
      modelId: sync.id,
      prompt: "Unknown",
    });
    assert.equal((await terminal(service, syncJob.id)).status, "interrupted");
    const noPollPath = await service.verifyJob(syncJob.id);
    assert.equal(noPollPath.outcome, "unsupported");
    assert.match(noPollPath.message, /无法远程验证/);
    // openai-images 与同步映射各提交一次；验证没有发出任何请求。
    assert.equal(posts(requests), 2);
    assert.equal(requests.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verifyJob refuses jobs without a remote task id or with a known result", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-verify-rules-"));
  const requests: string[] = [];
  let submitMode: "hang" | "reject" = "hang";
  const service = createCreationService({
    rootDir: root,
    credentials: credentials(),
    runTimeoutMs: 30,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      requests.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/submit") {
        if (submitMode === "reject") return new Response("rejected", { status: 400 });
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason ?? new Error("aborted")),
            { once: true },
          );
        });
      }
      if (path === "/poll/poll-1")
        return json({ status: "completed", asset: png.toString("base64") });
      throw new Error(`Unexpected fixture path: ${path}`);
    },
  });
  try {
    const model = await service.saveModel({
      name: "Async image",
      kind: "image",
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
    // 提交一直没有返回任务编号：没有远端编号时不能猜结果。
    const job = await service.createJob({
      requestId: "no-task-id",
      kind: "image",
      modelId: model.id,
      prompt: "No id",
    });
    assert.equal((await terminal(service, job.id)).status, "interrupted");
    await assert.rejects(service.verifyJob(job.id), /没有远端任务编号/);
    assert.equal(posts(requests), 1);
    await assert.rejects(service.verifyJob("missing-job"), /创作任务不存在/);
    // 有确定结果的任务不接受验证。
    submitMode = "reject";
    const done = await service.createJob({
      requestId: "already-failed",
      kind: "image",
      modelId: model.id,
      prompt: "Done",
    });
    assert.equal((await terminal(service, done.id)).status, "failed");
    await assert.rejects(service.verifyJob(done.id), /无需验证/);
    assert.equal(posts(requests), 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
