import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ICredentialService } from "../credential/credential.js";
import type {
  CreateCreationJobInput,
  CreationJob,
  CreationModel,
  CreationModelInput,
  ICreationService,
} from "./contract.js";
import { creationOutputFormat, runCreationProvider } from "./providers.js";
import { validateCreationModel } from "./modelValidation.js";

interface StoredJob extends CreationJob {
  providerTaskId?: string;
  referencePath?: string;
  referenceMimeType?: string;
  referenceHash?: string;
}

interface CreationFile<T> {
  version: 1;
  items: T[];
}

export interface CreationServiceOptions {
  rootDir: string;
  credentials: Pick<ICredentialService, "load" | "save" | "delete">;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
}

function credentialKey(id: string): string {
  return `knorvia-creation:${id}`;
}

function validId(value: string): string {
  if (!/^[\w-]{1,100}$/.test(value)) throw new Error("无效的创作记录编号");
  return value;
}

async function readRecords<T>(path: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  let parsed: CreationFile<T>;
  try {
    parsed = JSON.parse(raw) as CreationFile<T>;
  } catch {
    throw new Error("创作记录损坏；为避免丢失数据，已停止写入");
  }
  if (parsed.version !== 1 || !Array.isArray(parsed.items))
    throw new Error("创作记录版本不兼容；为避免丢失数据，已停止写入");
  return parsed.items;
}

async function writeRecords<T>(path: string, items: T[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, items } satisfies CreationFile<T>), {
    mode: 0o600,
  });
  try {
    // Windows 防病毒程序可能短暂占用目标文件，保留旧文件并重试原子替换。
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temporary, path);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (!["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt >= 8) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(25 * 2 ** attempt, 250)));
      }
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function publicJob(job: StoredJob): CreationJob {
  const {
    providerTaskId: _privateTaskId,
    referencePath: _referencePath,
    referenceMimeType: _referenceMimeType,
    referenceHash: _referenceHash,
    ...visible
  } = job;
  return visible;
}

function decodeReference(
  reference: CreateCreationJobInput["reference"],
):
  | { bytes: Uint8Array; name: string; mimeType: string; hash: string; extension: string }
  | undefined {
  if (!reference) return undefined;
  if (!["image/png", "image/jpeg", "image/webp"].includes(reference.mimeType))
    throw new Error("参考图只支持 PNG、JPEG 或 WebP");
  if (
    !reference.dataBase64 ||
    reference.dataBase64.length > 14 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/=]+$/.test(reference.dataBase64)
  )
    throw new Error("参考图为空、过大或数据无效（上限 10 MB）");
  const bytes = Buffer.from(reference.dataBase64, "base64");
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("参考图超过 10 MB 限制");
  const detected = creationOutputFormat(bytes, "image");
  if (detected.mimeType !== reference.mimeType) throw new Error("参考图内容与文件类型不匹配");
  return {
    bytes,
    name: reference.name.trim().slice(0, 150) || `reference.${detected.extension}`,
    mimeType: detected.mimeType,
    hash: createHash("sha256").update(bytes).digest("hex"),
    extension: detected.extension,
  };
}

export class CreationService implements ICreationService {
  private readonly modelsPath: string;
  private readonly jobsPath: string;
  private readonly controllers = new Map<string, AbortController>();
  private queuedMutation: Promise<unknown> = Promise.resolve();
  private ready?: Promise<void>;

  constructor(private readonly options: CreationServiceOptions) {
    this.modelsPath = join(options.rootDir, "models.json");
    this.jobsPath = join(options.rootDir, "jobs.json");
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queuedMutation.then(operation, operation);
    this.queuedMutation = next.catch(() => undefined);
    return next;
  }

  private initialize(): Promise<void> {
    if (!this.ready) {
      this.ready = this.mutate(async () => {
        await readRecords<CreationModel>(this.modelsPath);
        const jobs = await readRecords<StoredJob>(this.jobsPath);
        let changed = false;
        for (const job of jobs) {
          if (job.status !== "queued" && job.status !== "running") continue;
          job.status = "interrupted";
          job.updatedAt = new Date().toISOString();
          job.error = "应用上次退出时任务仍在运行；结果未知。请检查生成服务，再决定是否重新创建。";
          changed = true;
        }
        if (changed) await writeRecords(this.jobsPath, jobs);
      });
    }
    return this.ready;
  }

  private async publicModel(model: CreationModel): Promise<CreationModel> {
    const configured =
      model.protocol === "comfyui"
        ? Boolean(model.workflowJson)
        : model.protocol === "json-api"
          ? Boolean(model.apiMapping)
          : Boolean(await this.options.credentials.load(credentialKey(model.id)));
    return { ...model, configured };
  }

  async listModels(): Promise<CreationModel[]> {
    await this.initialize();
    const models = await readRecords<CreationModel>(this.modelsPath);
    return Promise.all(models.map((model) => this.publicModel(model)));
  }

  async saveModel(input: CreationModelInput): Promise<CreationModel> {
    await this.initialize();
    return this.mutate(async () => {
      const models = await readRecords<CreationModel>(this.modelsPath);
      const existing = input.id ? models.find((model) => model.id === validId(input.id!)) : null;
      if (input.id && !existing) throw new Error("创作模型不存在");
      const id = existing?.id ?? randomUUID();
      const record = validateCreationModel(input, id);
      // 凭据与普通配置分开保存；读取 RPC 永不回显密钥。
      if (input.apiKey?.trim())
        await this.options.credentials.save(credentialKey(id), input.apiKey.trim());
      const next = existing
        ? models.map((model) => (model.id === id ? record : model))
        : [...models, record];
      await writeRecords(this.modelsPath, next);
      return this.publicModel(record);
    });
  }

  async deleteModel(id: string): Promise<void> {
    await this.initialize();
    await this.mutate(async () => {
      validId(id);
      const models = await readRecords<CreationModel>(this.modelsPath);
      if (!models.some((model) => model.id === id)) throw new Error("创作模型不存在");
      await writeRecords(
        this.modelsPath,
        models.filter((model) => model.id !== id),
      );
      await this.options.credentials.delete(credentialKey(id));
    });
  }

  async listJobs(): Promise<CreationJob[]> {
    await this.initialize();
    const jobs = await readRecords<StoredJob>(this.jobsPath);
    return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicJob);
  }

  async getJob(id: string): Promise<CreationJob | null> {
    await this.initialize();
    validId(id);
    const jobs = await readRecords<StoredJob>(this.jobsPath);
    const job = jobs.find((item) => item.id === id);
    return job ? publicJob(job) : null;
  }

  async createJob(input: CreateCreationJobInput): Promise<CreationJob> {
    await this.initialize();
    return this.mutate(async () => {
      validId(input.requestId);
      validId(input.modelId);
      const reference = decodeReference(input.reference);
      const jobs = await readRecords<StoredJob>(this.jobsPath);
      const duplicate = jobs.find((job) => job.requestId === input.requestId);
      if (duplicate) {
        if (
          duplicate.kind !== input.kind ||
          duplicate.modelId !== input.modelId ||
          duplicate.prompt !== input.prompt.trim() ||
          duplicate.referenceHash !== reference?.hash
        )
          throw new Error("这次生成编号已用于其他内容");
        return publicJob(duplicate);
      }
      if (this.controllers.size >= 2) throw new Error("已有两个生成任务正在运行，请稍后再试");
      const models = await readRecords<CreationModel>(this.modelsPath);
      const model = models.find((item) => item.id === input.modelId);
      if (!model || !model.enabled || model.kind !== input.kind)
        throw new Error("所选模型不可用于此次创作");
      if (reference && input.kind !== "image") throw new Error("参考图只支持图片生成");
      if (
        reference &&
        model.protocol === "json-api" &&
        !/\{\{image(?:Base64|DataUrl)\}\}/.test(model.apiMapping?.requestTemplate ?? "")
      )
        throw new Error("当前模型未配置图生图输入");
      if (reference && model.protocol === "comfyui" && !model.workflowJson?.includes("{{image}}"))
        throw new Error("当前 ComfyUI 工作流未使用参考图");
      const publicModel = await this.publicModel(model);
      if (!publicModel.configured) throw new Error("请先配置所选模型");
      const prompt = input.prompt.trim();
      if (!prompt || prompt.length > 8000) throw new Error("提示词需在 1–8000 字符之间");
      const now = new Date().toISOString();
      const job: StoredJob = {
        id: randomUUID(),
        requestId: input.requestId,
        kind: input.kind,
        modelId: model.id,
        prompt,
        status: "queued",
        createdAt: now,
        updatedAt: now,
        outputs: [],
        ...(reference
          ? {
              referenceName: reference.name,
              referenceMimeType: reference.mimeType,
              referenceHash: reference.hash,
            }
          : {}),
      };
      if (reference) {
        const path = join(this.options.rootDir, "references", `${job.id}.${reference.extension}`);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, reference.bytes, { flag: "wx", mode: 0o600 });
        job.referencePath = path;
      }
      jobs.push(job);
      await writeRecords(this.jobsPath, jobs);
      const controller = new AbortController();
      this.controllers.set(job.id, controller);
      // 接纳事务落盘后才启动供应商请求；不把 provider 延迟传给 Renderer。
      queueMicrotask(() => void this.run(job, model, controller));
      return publicJob(job);
    });
  }

  async cancelJob(id: string): Promise<CreationJob> {
    await this.initialize();
    return this.mutate(async () => {
      validId(id);
      const jobs = await readRecords<StoredJob>(this.jobsPath);
      const job = jobs.find((item) => item.id === id);
      if (!job) throw new Error("创作任务不存在");
      if (job.status === "queued" || job.status === "running") {
        job.status = "cancelled";
        job.error = "已停止本地等待；已提交的远端任务可能继续运行或计费。";
        job.updatedAt = new Date().toISOString();
        await writeRecords(this.jobsPath, jobs);
        this.controllers.get(id)?.abort(new Error("用户已取消"));
      }
      return publicJob(job);
    });
  }

  private async updateJob(id: string, update: (job: StoredJob) => void): Promise<boolean> {
    return this.mutate(async () => {
      const jobs = await readRecords<StoredJob>(this.jobsPath);
      const job = jobs.find((item) => item.id === id);
      if (!job || job.status === "cancelled") return false;
      update(job);
      job.updatedAt = new Date().toISOString();
      await writeRecords(this.jobsPath, jobs);
      return true;
    });
  }

  private async run(
    job: StoredJob,
    model: CreationModel,
    controller: AbortController,
  ): Promise<void> {
    const timeout = setTimeout(
      () => controller.abort(new Error("等待生成服务超时")),
      16 * 60 * 1000,
    );
    timeout.unref?.();
    try {
      await this.updateJob(job.id, (record) => {
        record.status = "running";
      });
      if (controller.signal.aborted) return;
      const apiKey = await this.options.credentials.load(credentialKey(model.id));
      const referenceBytes = job.referencePath ? await readFile(job.referencePath) : undefined;
      const result = await runCreationProvider(
        {
          model,
          apiKey,
          prompt: job.prompt,
          signal: controller.signal,
          ...(referenceBytes && job.referenceMimeType && job.referenceName
            ? {
                reference: {
                  bytes: referenceBytes,
                  name: job.referenceName,
                  mimeType: job.referenceMimeType,
                },
              }
            : {}),
          onProviderTaskId: async (taskId) => {
            await this.updateJob(job.id, (record) => {
              record.providerTaskId = taskId;
            });
          },
        },
        { fetchImpl: this.options.fetchImpl, pollIntervalMs: this.options.pollIntervalMs },
      );
      controller.signal.throwIfAborted();
      const name = `creation-${job.id}.${result.extension}`;
      const path = join(this.options.rootDir, "assets", name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, result.bytes, { flag: "wx", mode: 0o600 });
      if (controller.signal.aborted) {
        await rm(path, { force: true });
        return;
      }
      const saved = await this.updateJob(job.id, (record) => {
        record.status = "succeeded";
        record.error = undefined;
        record.outputs = [
          {
            id: randomUUID(),
            name,
            mimeType: result.mimeType,
            path,
            size: result.bytes.byteLength,
          },
        ];
      });
      if (!saved) await rm(path, { force: true });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const apiKey = await this.options.credentials.load(credentialKey(model.id)).catch(() => null);
      const safe = apiKey ? raw.replaceAll(apiKey, "[redacted]") : raw;
      await this.updateJob(job.id, (record) => {
        record.status = "failed";
        record.error = safe.slice(0, 500);
      }).catch(() => undefined);
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(job.id);
    }
  }
}

export function createCreationService(options: CreationServiceOptions): ICreationService {
  return new CreationService(options);
}
