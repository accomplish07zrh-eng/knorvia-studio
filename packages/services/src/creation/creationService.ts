import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ICredentialService } from "../credential/credential.js";
import { creationReferenceSlots } from "./contract.js";
import type {
  CreateCreationJobInput,
  CreationJob,
  CreationModel,
  CreationModelInput,
  ICreationService,
} from "./contract.js";
import { runCreationProvider } from "./providers.js";
import { validateCreationModel } from "./modelValidation.js";
import {
  creationFailure,
  newCreationJob,
  providerReferences,
  sameCreationRequest,
} from "./creationJobs.js";
import {
  decodeReference,
  publicJob,
  readRecords,
  savedReference,
  writeRecords,
  type StoredJob,
} from "./creationStorage.js";

export interface CreationServiceOptions {
  rootDir: string;
  credentials: Pick<ICredentialService, "load" | "save" | "delete">;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  runTimeoutMs?: number;
  providerDeadlineMs?: number;
}

function credentialKey(id: string): string {
  return `knorvia-creation:${id}`;
}

function validId(value: string): string {
  if (!/^[\w-]{1,100}$/.test(value)) throw new Error("无效的创作记录编号");
  return value;
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
      const firstFrame = decodeReference(input.firstFrame);
      const lastFrame = decodeReference(input.lastFrame);
      const jobs = await readRecords<StoredJob>(this.jobsPath);
      const duplicate = jobs.find((job) => job.requestId === input.requestId);
      if (duplicate) {
        if (!sameCreationRequest(duplicate, input, { reference, firstFrame, lastFrame }))
          throw new Error("这次生成编号已用于其他内容");
        return publicJob(duplicate);
      }
      if (this.controllers.size >= 2) throw new Error("已有两个生成任务正在运行，请稍后再试");
      const models = await readRecords<CreationModel>(this.modelsPath);
      const model = models.find((item) => item.id === input.modelId);
      if (!model || !model.enabled || model.kind !== input.kind)
        throw new Error("所选模型不可用于此次创作");
      if (reference && input.kind !== "image") throw new Error("参考图只支持图片生成");
      if ((firstFrame || lastFrame) && input.kind !== "video")
        throw new Error("首尾帧仅支持视频生成");
      const slots = creationReferenceSlots(model);
      if (reference && !slots.image) throw new Error("当前模型未配置图生图输入");
      if (firstFrame && !slots.firstFrame) throw new Error("当前模型未配置首帧输入");
      if (lastFrame && !slots.lastFrame) throw new Error("当前模型未配置尾帧输入");
      const publicModel = await this.publicModel(model);
      if (!publicModel.configured) throw new Error("请先配置所选模型");
      const prompt = input.prompt.trim();
      if (!prompt || prompt.length > 8000) throw new Error("提示词需在 1–8000 字符之间");
      const job = newCreationJob(input, model, prompt, { reference, firstFrame, lastFrame });
      const writtenReferences: string[] = [];
      try {
        for (const [slot, item] of [
          ["reference", reference],
          ["firstFrame", firstFrame],
          ["lastFrame", lastFrame],
        ] as const) {
          if (!item) continue;
          const path = join(
            this.options.rootDir,
            "references",
            `${job.id}-${slot}.${item.extension}`,
          );
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, item.bytes, { flag: "wx", mode: 0o600 });
          writtenReferences.push(path);
          if (slot === "reference") job.referencePath = path;
          if (slot === "firstFrame") job.firstFramePath = path;
          if (slot === "lastFrame") job.lastFramePath = path;
        }
        jobs.push(job);
        await writeRecords(this.jobsPath, jobs);
      } catch (error) {
        await Promise.all(
          writtenReferences.map((path) => rm(path, { force: true }).catch(() => undefined)),
        );
        throw error;
      }
      const controller = new AbortController();
      this.controllers.set(job.id, controller);
      // 接纳事务落盘后才启动供应商请求；不把 provider 延迟传给 Renderer。
      queueMicrotask(() => void this.run(job, model, controller));
      return publicJob(job);
    });
  }

  async retryJob(id: string): Promise<CreationJob> {
    await this.initialize();
    validId(id);
    const jobs = await readRecords<StoredJob>(this.jobsPath);
    const source = jobs.find((job) => job.id === id);
    if (!source) throw new Error("创作任务不存在");
    if (source.status !== "failed")
      throw new Error("仅结果明确失败的任务可一键重试；未知结果请先检查生成服务");
    const requestId = `retry-${id}`;
    const previous = jobs.find((job) => job.requestId === requestId);
    if (previous) {
      if (
        previous.kind !== source.kind ||
        previous.modelId !== source.modelId ||
        previous.prompt !== source.prompt ||
        previous.referenceHash !== source.referenceHash ||
        previous.firstFrameHash !== source.firstFrameHash ||
        previous.lastFrameHash !== source.lastFrameHash
      )
        throw new Error("重试编号已用于其他内容");
      return publicJob(previous);
    }
    const reference = await savedReference(
      this.options.rootDir,
      source.referencePath,
      source.referenceName,
      source.referenceMimeType,
      source.referenceHash,
    );
    const firstFrame = await savedReference(
      this.options.rootDir,
      source.firstFramePath,
      source.firstFrameName,
      source.firstFrameMimeType,
      source.firstFrameHash,
    );
    const lastFrame = await savedReference(
      this.options.rootDir,
      source.lastFramePath,
      source.lastFrameName,
      source.lastFrameMimeType,
      source.lastFrameHash,
    );
    return this.createJob({
      requestId,
      kind: source.kind,
      modelId: source.modelId,
      prompt: source.prompt,
      ...(reference ? { reference } : {}),
      ...(firstFrame ? { firstFrame } : {}),
      ...(lastFrame ? { lastFrame } : {}),
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
    let submissionStarted = false;
    const timeout = setTimeout(
      () => controller.abort(new Error("等待生成服务超时")),
      this.options.runTimeoutMs ?? 16 * 60 * 1000,
    );
    timeout.unref?.();
    try {
      await this.updateJob(job.id, (record) => {
        record.status = "running";
      });
      if (controller.signal.aborted) return;
      const apiKey = await this.options.credentials.load(credentialKey(model.id));
      const references = await providerReferences(job);
      const result = await runCreationProvider(
        {
          model,
          apiKey,
          prompt: job.prompt,
          signal: controller.signal,
          onSubmissionStarted: () => {
            submissionStarted = true;
          },
          ...references,
          onProviderTaskId: async (taskId) => {
            await this.updateJob(job.id, (record) => {
              record.providerTaskId = taskId;
            });
          },
        },
        {
          fetchImpl: this.options.fetchImpl,
          pollIntervalMs: this.options.pollIntervalMs,
          deadlineMs: this.options.providerDeadlineMs,
        },
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
      const apiKey = await this.options.credentials.load(credentialKey(model.id)).catch(() => null);
      const failure = creationFailure(error, {
        apiKey,
        aborted: controller.signal.aborted,
        submissionStarted,
      });
      await this.updateJob(job.id, (record) => {
        record.status = failure.status;
        record.error = failure.error;
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
