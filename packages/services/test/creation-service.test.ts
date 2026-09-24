import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { createInterface } from "node:readline";
import { createCreationService } from "../src/creation/creationService.js";
import { createCreationAgentBridge } from "../src/creation/creationAgentBridge.js";
import type { CreationJob } from "../src/creation/contract.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=",
  "base64",
);
const mp4 = Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);

async function terminal(
  service: ReturnType<typeof createCreationService>,
  id: string,
): Promise<CreationJob> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const job = await service.getJob(id);
    if (job && !["queued", "running"].includes(job.status)) return job;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error("Creation job did not finish");
}

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

test("creation model key is write-only in public responses and persisted state", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-key-"));
  const credentialStore = credentials();
  const apiKey = "sk-fakecreationkey12345678901234567890";
  try {
    const service = createCreationService({ rootDir: root, credentials: credentialStore });
    const model = await service.saveModel({
      name: "Local fixture",
      kind: "image",
      protocol: "openai-images",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "fixture",
      enabled: true,
      apiKey,
    });
    assert.equal(model.configured, true);
    assert.equal(await credentialStore.load(`knorvia-creation:${model.id}`), apiKey);
    assert.equal(JSON.stringify(model).includes(apiKey), false);
    assert.equal(JSON.stringify(await service.listModels()).includes(apiKey), false);
    assert.equal((await readFile(join(root, "models.json"), "utf8")).includes(apiKey), false);
    const updated = await service.saveModel({
      id: model.id,
      name: "Local fixture updated",
      kind: "image",
      protocol: "openai-images",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "fixture",
      enabled: true,
      apiKey: "",
    });
    assert.equal(updated.configured, true);
    assert.equal(await credentialStore.load(`knorvia-creation:${model.id}`), apiKey);
    assert.equal((await readFile(join(root, "models.json"), "utf8")).includes(apiKey), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("image text/edit and video JSON API use durable idempotent jobs without returning keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-"));
  let generations = 0;
  let edits = 0;
  let videos = 0;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.url === "/v1/images/generations") generations++;
    else if (request.url === "/v1/images/edits") edits++;
    else if (request.url === "/video") videos++;
    else {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify(
        request.url === "/video"
          ? { asset: mp4.toString("base64") }
          : { data: [{ b64_json: png.toString("base64") }] },
      ),
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const service = createCreationService({
      rootDir: root,
      credentials: credentials(),
      pollIntervalMs: 5,
    });
    const image = await service.saveModel({
      name: "Image",
      kind: "image",
      protocol: "openai-images",
      baseUrl: `${baseUrl}/v1`,
      model: "fixture",
      enabled: true,
      apiKey: "secret-do-not-return",
    });
    assert.equal(image.configured, true);
    assert(!JSON.stringify(await service.listModels()).includes("secret-do-not-return"));
    const first = await service.createJob({
      requestId: "image-text",
      kind: "image",
      modelId: image.id,
      prompt: "A tree",
    });
    const done = await terminal(service, first.id);
    assert.equal(done.status, "succeeded");
    assert.deepEqual(await readFile(done.outputs[0]!.path), png);
    assert.equal(generations, 1);
    assert.equal(
      (
        await service.createJob({
          requestId: "image-text",
          kind: "image",
          modelId: image.id,
          prompt: "A tree",
        })
      ).id,
      first.id,
    );
    assert.equal(generations, 1);
    await assert.rejects(
      () =>
        service.createJob({
          requestId: "image-text",
          kind: "image",
          modelId: image.id,
          prompt: "Other",
        }),
      /已用于其他/,
    );
    const edited = await service.createJob({
      requestId: "image-edit",
      kind: "image",
      modelId: image.id,
      prompt: "A blue tree",
      reference: {
        name: "reference.png",
        mimeType: "image/png",
        dataBase64: png.toString("base64"),
      },
    });
    assert.equal((await terminal(service, edited.id)).status, "succeeded");
    assert.equal(edits, 1);
    const video = await service.saveModel({
      name: "Video",
      kind: "video",
      protocol: "json-api",
      baseUrl,
      model: "fixture-video",
      enabled: true,
      apiMapping: {
        requestPath: "/video",
        requestTemplate: '{"prompt":"{{prompt}}"}',
        outputPath: "asset",
      },
    });
    const videoJob = await service.createJob({
      requestId: "video-text",
      kind: "video",
      modelId: video.id,
      prompt: "Clouds",
    });
    assert.equal((await terminal(service, videoJob.id)).outputs[0]?.mimeType, "video/mp4");
    assert.equal(videos, 1);
    await assert.rejects(
      () =>
        service.createJob({
          requestId: "unsupported-edit",
          kind: "image",
          modelId: image.id,
          prompt: "Wrong type",
          reference: {
            name: "reference.png",
            mimeType: "image/jpeg",
            dataBase64: png.toString("base64"),
          },
        }),
      /内容与文件类型不匹配/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});

test("restart conservatively marks a submitted job interrupted and never resubmits it", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-restart-"));
  let submissions = 0;
  const secret = credentials();
  const fetchImpl: typeof fetch = async (_url, init) => {
    submissions++;
    await new Promise<never>((_done, reject) =>
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
    );
    throw new Error("unreachable");
  };
  try {
    const service = createCreationService({ rootDir: root, credentials: secret, fetchImpl });
    const model = await service.saveModel({
      name: "slow",
      kind: "image",
      protocol: "openai-images",
      baseUrl: "https://example.invalid",
      model: "fixture",
      enabled: true,
      apiKey: "secret",
    });
    const job = await service.createJob({
      requestId: "restart-once",
      kind: "image",
      modelId: model.id,
      prompt: "Moon",
    });
    for (let attempt = 0; attempt < 100 && submissions === 0; attempt++)
      await new Promise((done) => setTimeout(done, 10));
    assert.equal(submissions, 1);
    const restarted = createCreationService({ rootDir: root, credentials: secret, fetchImpl });
    assert.equal((await restarted.getJob(job.id))?.status, "interrupted");
    assert.equal(
      (
        await restarted.createJob({
          requestId: "restart-once",
          kind: "image",
          modelId: model.id,
          prompt: "Moon",
        })
      ).id,
      job.id,
    );
    assert.equal(submissions, 1);
    await service.cancelJob(job.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent MCP offers image-to-image with a project reference and revokes access after the turn", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-creation-agent-"));
  const script = resolve("packages/desktop/resources/creation-mcp.cjs");
  let edits = 0;
  let submissions = 0;
  const service = createCreationService({
    rootDir: join(root, "data"),
    credentials: credentials(),
    fetchImpl: async (url) => {
      submissions++;
      if (String(url).endsWith("/v1/images/edits")) edits++;
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), {
        headers: { "content-type": "application/json" },
      });
    },
  });
  const bridge = createCreationAgentBridge(service, {
    scriptPath: script,
    executablePath: process.execPath,
  });
  let child: ReturnType<typeof spawn> | undefined;
  try {
    await writeFile(join(root, "reference.png"), png);
    const model = await service.saveModel({
      name: "Image",
      kind: "image",
      protocol: "openai-images",
      baseUrl: "https://example.invalid",
      model: "fixture",
      enabled: true,
      apiKey: "secret",
    });
    const access = await bridge.issue(
      {
        runId: "r",
        turnId: "t",
        conversationId: "c",
        kernel: "codex",
        workspacePath: root,
        permission: "full-access",
        text: "",
      },
      { emit: async () => {}, ask: async () => ({ decision: "deny" }) },
      new AbortController().signal,
    );
    assert.equal(access.server.type, "stdio");
    if (access.server.type !== "stdio") throw new Error("Expected stdio");
    child = spawn(access.server.command, access.server.args, {
      env: { ...process.env, ...access.server.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const responses = new Map<number, (value: any) => void>();
    createInterface({ input: child.stdout! }).on("line", (line) => {
      const value = JSON.parse(line) as { id: number };
      responses.get(value.id)?.(value);
      responses.delete(value.id);
    });
    let sequence = 0;
    const request = (method: string, params: unknown = {}) =>
      new Promise<any>((done) => {
        const id = ++sequence;
        responses.set(id, done);
        child!.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    assert(
      (await request("initialize", { protocolVersion: "2025-06-18" })).result.capabilities.tools,
    );
    const listed = (await request("tools/list")).result.tools as Array<{
      name: string;
      annotations?: { destructiveHint?: boolean; readOnlyHint?: boolean };
    }>;
    assert.equal(
      listed.find((tool) => tool.name === "create_image")?.annotations?.destructiveHint,
      true,
    );
    assert.equal(
      listed.find((tool) => tool.name === "list_models")?.annotations?.readOnlyHint,
      true,
    );
    const created = await request("tools/call", {
      name: "create_image",
      arguments: {
        model_id: model.id,
        prompt: "Change color",
        reference_image_path: "reference.png",
        request_id: "agent-edit",
      },
    });
    const job = JSON.parse(created.result.content[0].text) as CreationJob;
    assert.equal((await terminal(service, job.id)).status, "succeeded");
    assert.equal(edits, 1);
    access.revoke();
    const denied = await request("tools/call", { name: "list_models", arguments: {} });
    assert.equal(denied.result.isError, true);
    const native = await bridge.issueNative(root);
    assert.equal(native.name, "knorvia_creation");
    assert.equal(native.isolation, "workspace");
    const nativeEnv = Object.fromEntries(
      (native.env ?? []).map(({ name, value }) => [name, value]),
    );
    const response = await fetch(`${nativeEnv.KNORVIA_CREATION_BRIDGE_URL}/tool`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${nativeEnv.KNORVIA_CREATION_BRIDGE_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "list_models", arguments: {} }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).result[0].id, model.id);
    const deniedTurn = {
      runId: "r2",
      turnId: "t2",
      conversationId: "c2",
      kernel: "codex" as const,
      workspacePath: root,
      permission: "read-only" as const,
      text: "",
    };
    const readOnly = await bridge.issue(
      deniedTurn,
      { emit: async () => {}, ask: async () => ({ decision: "deny" }) },
      new AbortController().signal,
    );
    const invokeGeneration = async (server: typeof readOnly.server) => {
      if (server.type !== "stdio") throw new Error("Expected stdio");
      return fetch(`${server.env.KNORVIA_CREATION_BRIDGE_URL}/tool`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${server.env.KNORVIA_CREATION_BRIDGE_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "create_image",
          arguments: { model_id: model.id, prompt: "Should not generate" },
        }),
      });
    };
    assert.equal((await invokeGeneration(readOnly.server)).status, 400);
    readOnly.revoke();
    let approvals = 0;
    const asks = await bridge.issue(
      { ...deniedTurn, permission: "ask" },
      {
        emit: async () => {},
        ask: async () => {
          approvals++;
          return { decision: "deny" };
        },
      },
      new AbortController().signal,
    );
    assert.equal((await invokeGeneration(asks.server)).status, 400);
    assert.equal(approvals, 1);
    asks.revoke();
    assert.equal(edits, 1);
    assert.equal(submissions, 1);
  } finally {
    child?.kill();
    await bridge.disposeAllAndWait();
    await rm(root, { recursive: true, force: true });
  }
});
