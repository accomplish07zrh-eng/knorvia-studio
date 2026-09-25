import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { redactDiagnosticText } from "@knorvia/shared";
import type {
  CreateCreationJobInput,
  CreationJob,
  CreationKind,
  CreationModel,
  CreationParameterSnapshot,
  CreationProvenance,
  CreationVerification,
  CreationVerificationOutcome,
} from "./contract.js";
import {
  apiUrl,
  comfyHistoryState,
  downloadComfyOutput,
  jsonOutput,
  jsonPollState,
  providerHeaders,
  readJson,
  type CreationProviderOutput,
} from "./providers.js";
import {
  creationProvenance,
  readRecords,
  validId,
  writeCreationOutput,
  type decodeReference,
  type StoredJob,
} from "./creationStorage.js";

type Reference = NonNullable<ReturnType<typeof decodeReference>>;
export interface CreationReferences {
  reference?: Reference;
  firstFrame?: Reference;
  lastFrame?: Reference;
}

/** 快照只从白名单取值：地址、工作流 JSON、API 映射与凭据都不进入记录。 */
function creationParameterSnapshot(
  model: CreationModel,
  kind: CreationKind,
  prompt: string,
  refs: CreationReferences,
  capturedAt: string,
): CreationParameterSnapshot {
  const { reference, firstFrame, lastFrame } = refs;
  return {
    kind,
    modelId: model.id,
    modelName: model.name,
    protocol: model.protocol,
    prompt,
    params: { prompt, model: model.model },
    capturedAt,
    ...(reference ? { referenceName: reference.name, referenceHash: reference.hash } : {}),
    ...(firstFrame ? { firstFrameName: firstFrame.name, firstFrameHash: firstFrame.hash } : {}),
    ...(lastFrame ? { lastFrameName: lastFrame.name, lastFrameHash: lastFrame.hash } : {}),
  };
}

/** 来源关系也是提交内容的一部分：缺项或不可解析都按“不是同一次提交”处理。 */
function sameProvenance(stored?: CreationProvenance, next?: CreationProvenance): boolean {
  try {
    const a = creationProvenance(stored) ?? {};
    const b = creationProvenance(next) ?? {};
    return (
      a.parentJobId === b.parentJobId &&
      a.referencedOutputId === b.referencedOutputId &&
      a.repeatOfRequestId === b.repeatOfRequestId
    );
  } catch {
    return false;
  }
}

/**
 * 同一 requestId 只能对应同一次生成内容与同一来源关系，
 * 防止应答丢失后的重试被当作新请求，也防止复用盖掉原始提交记录。
 */
export function sameCreationRequest(
  job: StoredJob,
  input: CreateCreationJobInput,
  refs: CreationReferences,
  provenance?: CreationProvenance,
): boolean {
  return (
    job.kind === input.kind &&
    job.modelId === input.modelId &&
    job.prompt === input.prompt.trim() &&
    job.referenceHash === refs.reference?.hash &&
    job.firstFrameHash === refs.firstFrame?.hash &&
    job.lastFrameHash === refs.lastFrame?.hash &&
    sameProvenance(job.provenance, provenance)
  );
}

export function newCreationJob(
  input: CreateCreationJobInput,
  model: CreationModel,
  prompt: string,
  refs: CreationReferences,
  provenance?: CreationProvenance,
): StoredJob {
  const now = new Date().toISOString();
  const { reference, firstFrame, lastFrame } = refs;
  return {
    id: randomUUID(),
    requestId: input.requestId,
    kind: input.kind,
    modelId: model.id,
    prompt,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    outputs: [],
    parameterSnapshot: creationParameterSnapshot(model, input.kind, prompt, refs, now),
    ...(provenance ? { provenance } : {}),
    ...(reference
      ? {
          referenceName: reference.name,
          referenceMimeType: reference.mimeType,
          referenceHash: reference.hash,
        }
      : {}),
    ...(firstFrame
      ? {
          firstFrameName: firstFrame.name,
          firstFrameMimeType: firstFrame.mimeType,
          firstFrameHash: firstFrame.hash,
        }
      : {}),
    ...(lastFrame
      ? {
          lastFrameName: lastFrame.name,
          lastFrameMimeType: lastFrame.mimeType,
          lastFrameHash: lastFrame.hash,
        }
      : {}),
  };
}

type ProviderFile = { bytes: Uint8Array; name: string; mimeType: string };

/** 读取已落盘的参考图与首尾帧，只有名称与类型齐全时才交给供应商。 */
export async function providerReferences(job: StoredJob): Promise<{
  reference?: ProviderFile;
  firstFrame?: ProviderFile;
  lastFrame?: ProviderFile;
}> {
  const load = async (path?: string, name?: string, mimeType?: string) =>
    path && name && mimeType ? { bytes: await readFile(path), name, mimeType } : undefined;
  const reference = await load(job.referencePath, job.referenceName, job.referenceMimeType);
  const firstFrame = await load(job.firstFramePath, job.firstFrameName, job.firstFrameMimeType);
  const lastFrame = await load(job.lastFramePath, job.lastFrameName, job.lastFrameMimeType);
  return {
    ...(reference ? { reference } : {}),
    ...(firstFrame ? { firstFrame } : {}),
    ...(lastFrame ? { lastFrame } : {}),
  };
}

/**
 * 已提交后遇到取消或网络类错误时，远端可能仍在运行或计费，只能记为结果未知；
 * 其余错误去掉密钥后作为明确失败。
 */

/** 只读查询能力：只有真正有查询接口的协议才允许远程验证。 */
export type CreationQueryCapability = "comfyui-history" | "json-api-poll" | "unsupported";

export function creationQueryCapability(
  model: Pick<CreationModel, "protocol" | "apiMapping">,
): CreationQueryCapability {
  if (model.protocol === "comfyui") return "comfyui-history";
  if (model.protocol === "json-api" && model.apiMapping?.pollPath && model.apiMapping.statusPath)
    return "json-api-poll";
  return "unsupported";
}

export interface CreationQueryOutcome {
  /** 供应商是否具备只读查询能力；false 表示只能诚实回答“无法远程验证”。 */
  supported: boolean;
  status: "succeeded" | "failed" | "unknown";
  message: string;
  /** 仅在 status === "succeeded" 时给出。 */
  output?: CreationProviderOutput;
}

export interface CreationQueryInput {
  model: CreationModel;
  apiKey: string | null;
  kind: CreationKind;
  taskId: string;
  signal: AbortSignal;
}

async function queryComfyUiHistory(
  input: CreationQueryInput,
  fetchImpl: typeof fetch,
): Promise<CreationQueryOutcome> {
  const url = apiUrl(input.model.baseUrl, `/history/${encodeURIComponent(input.taskId)}`);
  const history = await readJson(
    await fetchImpl(url, { headers: providerHeaders(input.apiKey), signal: input.signal }),
  );
  const state = comfyHistoryState(history, input.taskId, input.kind);
  if (state.kind === "failed") return { supported: true, status: "failed", message: state.message };
  if (state.kind === "pending")
    return {
      supported: true,
      status: "unknown",
      message: state.seen
        ? "远端任务尚未结束，结果仍未知。"
        : "远端没有返回该任务的历史记录，结果仍未知。",
    };
  return {
    supported: true,
    status: "succeeded",
    message: "远端历史记录确认任务已完成。",
    output: await downloadComfyOutput(
      input.model,
      state.file,
      input.apiKey,
      input.signal,
      fetchImpl,
    ),
  };
}

async function queryJsonApiState(
  input: CreationQueryInput,
  fetchImpl: typeof fetch,
): Promise<CreationQueryOutcome> {
  const mapping = input.model.apiMapping!;
  const pollPath = mapping.pollPath!.replaceAll("{{taskId}}", encodeURIComponent(input.taskId));
  const state = await readJson(
    await fetchImpl(apiUrl(input.model.baseUrl, pollPath), {
      headers: providerHeaders(input.apiKey),
      signal: input.signal,
    }),
  );
  const poll = jsonPollState(mapping, state);
  if (poll.kind === "succeeded")
    return {
      supported: true,
      status: "succeeded",
      message: "远端查询确认任务已完成。",
      output: await jsonOutput(state, mapping, input, fetchImpl),
    };
  if (poll.kind === "failed")
    return { supported: true, status: "failed", message: `远端查询报告失败：${poll.status}` };
  return {
    supported: true,
    status: "unknown",
    message: `远端查询状态为 ${poll.status || "未知"}，结果仍未知。`,
  };
}

function unsupportedQueryMessage(model: Pick<CreationModel, "protocol">): string {
  return model.protocol === "openai-images"
    ? "OpenAI 图片协议没有只读查询接口，无法远程验证结果。"
    : "该 API 映射没有配置查询路径与状态字段，无法远程验证结果。";
}

/**
 * 只读查询远端任务状态：只发 GET，绝不 POST 新生成请求，也不产生新的任务编号。
 * 查询失败只代表结果未知——网络错误、超时与 5xx 都不能把未知改判为失败。
 */
export async function queryCreationProvider(
  input: CreationQueryInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<CreationQueryOutcome> {
  const capability = creationQueryCapability(input.model);
  if (capability === "unsupported")
    return { supported: false, status: "unknown", message: unsupportedQueryMessage(input.model) };
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    return capability === "comfyui-history"
      ? await queryComfyUiHistory(input, fetchImpl)
      : await queryJsonApiState(input, fetchImpl);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const safe = redactDiagnosticText(
      input.apiKey ? raw.replaceAll(input.apiKey, "[redacted]") : raw,
    );
    return {
      supported: true,
      status: "unknown",
      message: `查询远端状态失败，结果仍未知：${safe.slice(0, 300)}`,
    };
  }
}

export interface CreationVerificationContext {
  rootDir: string;
  jobsPath: string;
  modelsPath: string;
  /** 由服务提供的凭据读取入口；密钥永不写入任务记录。 */
  loadApiKey(modelId: string): Promise<string | null>;
  fetchImpl?: typeof fetch;
  verifyTimeoutMs?: number;
  /** 由唯一的 Host Service 提供的串行写入与读取入口，验证不另建写入路径。 */
  updateJob(
    id: string,
    update: (job: StoredJob) => void,
    options?: { allowCancelled?: boolean },
  ): Promise<boolean>;
  getJob(id: string): Promise<CreationJob | null>;
}

/**
 * 只读远程验证未知结果：只查询、绝不提交新的生成请求。
 * 无法确认时保持原状态，只写 checkedAt 与诚实说明。
 */
export async function verifyStoredJob(
  context: CreationVerificationContext,
  id: string,
): Promise<CreationVerification> {
  validId(id);
  const jobs = await readRecords<StoredJob>(context.jobsPath);
  const job = jobs.find((item) => item.id === id);
  if (!job) throw new Error("创作任务不存在");
  if (job.status !== "interrupted" && job.status !== "cancelled")
    throw new Error("仅结果未知的任务可以远程验证；已有确定结果或仍在运行的任务无需验证");
  const models = await readRecords<CreationModel>(context.modelsPath);
  const model = models.find((item) => item.id === job.modelId);
  if (!model) throw new Error("原任务的模型已不存在，无法远程验证");
  const capability = creationQueryCapability(model);
  const taskId = job.providerTaskId ?? "";
  if (!taskId && capability !== "unsupported")
    throw new Error("该任务没有远端任务编号，无法远程验证");
  const apiKey = await context.loadApiKey(model.id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), context.verifyTimeoutMs ?? 20_000);
  timeout.unref?.();
  let outcome: CreationQueryOutcome;
  try {
    outcome = await queryCreationProvider(
      { model, apiKey, kind: job.kind, taskId, signal: controller.signal },
      { fetchImpl: context.fetchImpl },
    );
  } finally {
    clearTimeout(timeout);
  }
  const checkedAt = new Date().toISOString();
  const refreshed = async () => {
    const value = await context.getJob(id);
    if (!value) throw new Error("创作任务记录已丢失，验证结果未保存");
    return value;
  };
  if (outcome.status === "succeeded" && outcome.output) {
    const { output, created } = await writeCreationOutput(
      context.rootDir,
      job.id,
      outcome.output,
      job.kind,
    );
    let applied = false;
    const saved = await context.updateJob(
      job.id,
      (record) => {
        // 若已有确定成果（并发完成），保留它，不做第二次写入。
        if (record.status === "succeeded" && record.outputs.length) return;
        record.status = "succeeded";
        record.error = undefined;
        record.checkedAt = checkedAt;
        record.outputs = [output];
        applied = true;
      },
      { allowCancelled: true },
    );
    if (!saved) {
      if (created) await rm(output.path, { force: true });
      throw new Error("创作任务记录已丢失，验证结果未保存");
    }
    if (!applied && created) await rm(output.path, { force: true });
    return { job: await refreshed(), outcome: "succeeded", message: outcome.message, checkedAt };
  }
  const verification: CreationVerificationOutcome =
    outcome.status === "failed" ? "failed" : outcome.supported ? "unknown" : "unsupported";
  await context.updateJob(
    job.id,
    (record) => {
      if (outcome.status === "failed") record.status = "failed";
      record.error = outcome.message;
      record.checkedAt = checkedAt;
    },
    { allowCancelled: true },
  );
  return { job: await refreshed(), outcome: verification, message: outcome.message, checkedAt };
}
