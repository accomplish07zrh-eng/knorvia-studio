import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { ICreationService } from "../../creation/contract.js";
import type { KnorviaAgentMcpServer } from "@knorvia/shared";
import type { StudioKernelSink, StudioKernelTurn, StudioSharedMcpServer } from "../kernelTypes.js";
import { readCreationReference } from "../../creation/node.js";

const MAX_REQUEST_BYTES = 64 * 1024;

interface Grant {
  token: string;
  workspacePath: string;
  permission: StudioKernelTurn["permission"];
  sink: StudioKernelSink;
  signal: AbortSignal;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("创作工具参数必须是对象");
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string, max = 8000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${name} 缺失或过长`);
  return value.trim();
}

function sameToken(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("创作工具请求过大");
    chunks.push(chunk);
  }
  return record(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
}

function respond(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

export function createCreationAgentBridge(
  creation: ICreationService,
  options: { scriptPath: string; executablePath: string; runtimeEnv?: Record<string, string> },
) {
  const grants = new Map<string, Grant>();
  const nativeTokens = new Map<string, string>();
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== "POST" || request.url !== "/tool") {
        respond(response, 404, { error: "Not found" });
        return;
      }
      const header = request.headers.authorization;
      const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
      const grant = [...grants.values()].find((entry) => sameToken(entry.token, token));
      if (!grant || grant.signal.aborted) {
        respond(response, 401, { error: "创作会话已结束" });
        return;
      }
      const input = await body(request);
      const result = await call(
        grant,
        string(input.name, "工具名称", 100),
        record(input.arguments ?? {}),
      );
      respond(response, 200, { result });
    })().catch((error) => {
      respond(response, 400, {
        error: error instanceof Error ? error.message : "创作工具调用失败",
      });
    });
  });
  let addressPromise: Promise<string> | undefined;
  let closePromise: Promise<void> | undefined;
  let disposed = false;

  async function start(): Promise<string> {
    if (disposed) throw new Error("创作服务已关闭");
    addressPromise ??= new Promise((resolveAddress, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        const address = server.address();
        if (!address || typeof address === "string") reject(new Error("创作服务未能启动"));
        else resolveAddress(`http://127.0.0.1:${address.port}`);
      });
    });
    return addressPromise;
  }

  async function call(grant: Grant, name: string, args: Record<string, unknown>): Promise<unknown> {
    grant.signal.throwIfAborted();
    if (name === "list_models") {
      return (await creation.listModels()).map(
        ({ id, name, kind, protocol, configured, enabled }) => ({
          id,
          name,
          kind,
          protocol,
          configured,
          enabled,
        }),
      );
    }
    if (name === "get_job") return creation.getJob(string(args.job_id, "任务编号", 100));
    if (name === "cancel_job") {
      if (grant.permission === "read-only") throw new Error("当前角色为只读权限，不能取消生成");
      if (grant.permission === "ask") {
        const answer = await grant.sink.ask(
          {
            id: randomUUID(),
            kind: "approval",
            title: "允许 Agent 取消创作任务？",
            detail: `任务：${string(args.job_id, "任务编号", 100)}\n已提交的远端任务可能继续运行或计费。`,
            choices: ["允许一次", "拒绝"],
          },
          grant.signal,
        );
        if (answer.decision !== "allow-once" && answer.decision !== "allow-session")
          throw new Error("用户未批准此次取消");
      }
      return creation.cancelJob(string(args.job_id, "任务编号", 100));
    }
    if (name === "wait_job") {
      const id = string(args.job_id, "任务编号", 100);
      const seconds = Math.max(1, Math.min(20, Number(args.seconds) || 10));
      const deadline = Date.now() + seconds * 1000;
      while (Date.now() < deadline) {
        grant.signal.throwIfAborted();
        const job = await creation.getJob(id);
        if (!job || !["queued", "running"].includes(job.status)) return job;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
      }
      return creation.getJob(id);
    }
    if (name !== "create_image" && name !== "create_video") throw new Error("未知的创作工具");
    if (grant.permission === "read-only") throw new Error("当前角色为只读权限，不能发起生成");
    const kind = name === "create_image" ? "image" : "video";
    const prompt = string(args.prompt, "提示词");
    const modelId = string(args.model_id, "模型编号", 100);
    if (grant.permission === "ask") {
      const answer = await grant.sink.ask(
        {
          id: randomUUID(),
          kind: "approval",
          title: `允许 Agent 生成${kind === "image" ? "图片" : "视频"}？`,
          detail: `模型：${modelId}\n提示词：${prompt.slice(0, 500)}\n该请求可能产生费用。`,
          choices: ["允许一次", "拒绝"],
        },
        grant.signal,
      );
      if (answer.decision !== "allow-once" && answer.decision !== "allow-session")
        throw new Error("用户未批准此次生成");
    }
    const referencePath = args.reference_image_path;
    if (referencePath !== undefined && (kind !== "image" || typeof referencePath !== "string"))
      throw new Error("参考图只支持图片生成");
    const image =
      typeof referencePath === "string" && referencePath.trim()
        ? await readCreationReference(referencePath, grant.workspacePath, creation)
        : undefined;
    return creation.createJob({
      requestId:
        typeof args.request_id === "string" && /^[\w-]{1,100}$/.test(args.request_id)
          ? args.request_id
          : randomUUID(),
      kind,
      modelId,
      prompt,
      ...(image ? { reference: image } : {}),
    });
  }

  return {
    async issue(
      turn: StudioKernelTurn,
      sink: StudioKernelSink,
      signal: AbortSignal,
    ): Promise<{ server: StudioSharedMcpServer; revoke: () => void }> {
      const url = await start();
      const token = randomUUID() + randomUUID();
      grants.set(token, {
        token,
        workspacePath: turn.workspacePath,
        permission: turn.permission,
        sink,
        signal,
      });
      return {
        server: {
          name: "knorvia_creation",
          type: "stdio",
          command: options.executablePath,
          args: [options.scriptPath],
          env: {
            ...options.runtimeEnv,
            KNORVIA_CREATION_BRIDGE_URL: url,
            KNORVIA_CREATION_BRIDGE_TOKEN: token,
          },
        },
        revoke: () => {
          grants.delete(token);
        },
      };
    },
    async issueNative(workspacePath: string): Promise<KnorviaAgentMcpServer> {
      const url = await start();
      let token = nativeTokens.get(workspacePath);
      if (!token) {
        token = randomUUID() + randomUUID();
        nativeTokens.set(workspacePath, token);
        // Native Knorvia marks every MCP tool as requiring its own approval in build mode.
        // The bridge itself therefore accepts calls from this session; the native tool gate
        // remains the user-facing approval owner, including for the original single chat.
        grants.set(token, {
          token,
          workspacePath,
          permission: "full-access",
          sink: { emit: async () => {}, ask: async () => ({ decision: "deny" }) },
          signal: new AbortController().signal,
        });
      }
      return {
        name: "knorvia_creation",
        command: options.executablePath,
        args: [options.scriptPath],
        env: Object.entries({
          ...options.runtimeEnv,
          KNORVIA_CREATION_BRIDGE_URL: url,
          KNORVIA_CREATION_BRIDGE_TOKEN: token,
        }).map(([name, value]) => ({ name, value })),
        isolation: "workspace",
      };
    },
    async disposeAllAndWait(): Promise<void> {
      disposed = true;
      grants.clear();
      nativeTokens.clear();
      closePromise ??= (async () => {
        await addressPromise?.catch(() => undefined);
        if (!server.listening) return;
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      })();
      await closePromise;
    },
  };
}

export type CreationAgentBridge = ReturnType<typeof createCreationAgentBridge>;
