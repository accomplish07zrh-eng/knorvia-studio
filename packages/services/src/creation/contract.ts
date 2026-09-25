import { createServiceDescriptor } from "../descriptors.js";

export type CreationKind = "image" | "video";
export type CreationProtocol = "openai-images" | "comfyui" | "json-api";
export interface CreationApiMapping {
  requestPath: string;
  requestTemplate: string;
  outputPath: string;
  taskIdPath?: string;
  pollPath?: string;
  statusPath?: string;
  successValues?: string[];
  failureValues?: string[];
}
export type CreationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface CreationModel {
  id: string;
  name: string;
  kind: CreationKind;
  protocol: CreationProtocol;
  baseUrl: string;
  model: string;
  enabled: boolean;
  configured: boolean;
  /** ComfyUI API-format graph. The API key is never returned. */
  workflowJson?: string;
  apiMapping?: CreationApiMapping;
}

/** Template placeholders are the explicit capability contract for reference uploads. */
export function creationReferenceSlots(
  model: Pick<CreationModel, "kind" | "protocol" | "workflowJson" | "apiMapping">,
) {
  const template =
    model.protocol === "comfyui"
      ? (model.workflowJson ?? "")
      : model.protocol === "json-api"
        ? (model.apiMapping?.requestTemplate ?? "")
        : "";
  return {
    image:
      model.kind === "image" &&
      (model.protocol === "openai-images" ||
        (model.protocol === "comfyui" && template.includes("{{image}}")) ||
        (model.protocol === "json-api" && /\{\{image(?:Base64|DataUrl)\}\}/u.test(template))),
    firstFrame:
      model.kind === "video" &&
      (model.protocol === "comfyui"
        ? template.includes("{{firstFrame}}")
        : model.protocol === "json-api" && /\{\{firstFrame(?:Base64|DataUrl)\}\}/u.test(template)),
    lastFrame:
      model.kind === "video" &&
      (model.protocol === "comfyui"
        ? template.includes("{{lastFrame}}")
        : model.protocol === "json-api" && /\{\{lastFrame(?:Base64|DataUrl)\}\}/u.test(template)),
  };
}

export interface CreationModelInput {
  id?: string;
  name: string;
  kind: CreationKind;
  protocol: CreationProtocol;
  baseUrl: string;
  model: string;
  enabled: boolean;
  workflowJson?: string;
  apiMapping?: CreationApiMapping;
  /** Write-only. Empty value preserves an existing key. */
  apiKey?: string;
}

export interface CreationOutput {
  id: string;
  name: string;
  mimeType: string;
  path: string;
  size: number;
  /** 成果文件内容的 sha256；旧记录可能缺失，工作流交接必须先校验它。 */
  hash?: string;
}

/**
 * 有效生成参数：当前只有提示词与提交给供应商的模型标识。
 * 新增参数（尺寸、时长、画幅等）必须先进入契约白名单，才能被快照记录。
 */
export interface CreationEffectiveParams {
  prompt: string;
  model: string;
}

/**
 * 参数快照：只记录显式白名单字段，绝不展开模型、工作流或 API 映射对象。
 * 参考图只记录名称与内容哈希，字节与 base64 永不进入任务记录。
 */
export interface CreationParameterSnapshot {
  kind: CreationKind;
  modelId: string;
  modelName: string;
  protocol: CreationProtocol;
  prompt: string;
  referenceName?: string;
  referenceHash?: string;
  firstFrameName?: string;
  firstFrameHash?: string;
  lastFrameName?: string;
  lastFrameHash?: string;
  params: CreationEffectiveParams;
  capturedAt: string;
}

/** 来源关系：只含这三个白名单字段，其他输入键一律忽略。 */
export interface CreationProvenance {
  parentJobId?: string;
  referencedOutputId?: string;
  repeatOfRequestId?: string;
}

export interface CreationJob {
  id: string;
  requestId: string;
  kind: CreationKind;
  modelId: string;
  prompt: string;
  status: CreationJobStatus;
  createdAt: string;
  updatedAt: string;
  outputs: CreationOutput[];
  error?: string;
  referenceName?: string;
  firstFrameName?: string;
  lastFrameName?: string;
  /** 接纳时写入的参数快照；旧记录没有该字段。 */
  parameterSnapshot?: CreationParameterSnapshot;
  provenance?: CreationProvenance;
  /** 最近一次只读远程验证的时间；结果仍未知时它是“已检查过”的唯一标记。 */
  checkedAt?: string;
  /** 由 publicJob 计算：快照是否足以重建这次提交。旧记录诚实为 false。 */
  reconstructible?: boolean;
  /** 由 publicJob 计算：reconstructible 为 false 时缺失或不一致的字段。 */
  missing?: string[];
}

export interface CreateCreationJobInput {
  requestId: string;
  kind: CreationKind;
  modelId: string;
  prompt: string;
  reference?: { name: string; mimeType: string; dataBase64: string };
  firstFrame?: { name: string; mimeType: string; dataBase64: string };
  lastFrame?: { name: string; mimeType: string; dataBase64: string };
  /** 可选来源信息（复用、重做、工作流交接）；服务端只做白名单与格式校验。 */
  provenance?: CreationProvenance;
}

/** 复用草稿：可以直接回传给 createJob，本身不产生任何副作用。 */
export interface CreationReuseDraft extends CreateCreationJobInput {
  provenance: CreationProvenance;
  /** 源任务的参数快照；源记录没有快照时不带该字段。 */
  parameterSnapshot?: CreationParameterSnapshot;
  /** 源记录快照的缺失项；为空表示源记录可完整重建。 */
  missing: string[];
  /** 源任务结果未知（interrupted／cancelled）时为 true：再次提交会产生第二次付费请求。 */
  previousResultUnknown: boolean;
}

export type CreationVerificationOutcome = "succeeded" | "failed" | "unknown" | "unsupported";

export interface CreationVerification {
  job: CreationJob;
  outcome: CreationVerificationOutcome;
  message: string;
  checkedAt: string;
}

export interface ICreationService {
  listModels(): Promise<CreationModel[]>;
  saveModel(input: CreationModelInput): Promise<CreationModel>;
  deleteModel(id: string): Promise<void>;
  listJobs(): Promise<CreationJob[]>;
  getJob(id: string): Promise<CreationJob | null>;
  createJob(input: CreateCreationJobInput): Promise<CreationJob>;
  retryJob(id: string): Promise<CreationJob>;
  cancelJob(id: string): Promise<CreationJob>;
  /** 返回带新编号的复用草稿；只读源记录，不写盘、不提交供应商请求。 */
  reuseJob(id: string): Promise<CreationReuseDraft>;
  /** 只读远程验证未知结果；永不提交新的生成请求。 */
  verifyJob(id: string): Promise<CreationVerification>;
}

export const ICreationService = createServiceDescriptor<ICreationService>("studio-creation");

// 字节边界属于契约：执行层与只读验证共用同一份格式与大小校验。
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

/** 按魔数判定成果类型；参考图与成果文件共用同一套校验。 */
export function creationOutputFormat(
  bytes: Uint8Array,
  kind: CreationKind,
): { mimeType: string; extension: string } {
  const matches = (magic: number[]) => magic.every((byte, index) => bytes[index] === byte);
  if (kind === "image") {
    if (matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      return { mimeType: "image/png", extension: "png" };
    if (matches([0xff, 0xd8, 0xff])) return { mimeType: "image/jpeg", extension: "jpg" };
    if (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    )
      return { mimeType: "image/webp", extension: "webp" };
  } else {
    if (String.fromCharCode(...bytes.slice(4, 8)) === "ftyp")
      return { mimeType: "video/mp4", extension: "mp4" };
    if (matches([0x1a, 0x45, 0xdf, 0xa3])) return { mimeType: "video/webm", extension: "webm" };
  }
  throw new Error("生成服务返回的文件格式与任务类型不符");
}

/** 校验大小与格式后的成果字节。 */
export function output(
  bytes: Uint8Array,
  kind: CreationKind,
): { bytes: Uint8Array; mimeType: string; extension: string } {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_OUTPUT_BYTES)
    throw new Error("生成文件为空或超过 256 MB 限制");
  return { bytes, ...creationOutputFormat(bytes, kind) };
}

/** 读取受大小上限保护的字节流；成果下载与参考图读取共用。 */
export async function readLimited(
  response: Response,
  limit = MAX_OUTPUT_BYTES,
): Promise<Uint8Array> {
  if (!response.ok) throw new Error(`生成服务返回 ${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error("生成服务响应超过大小限制");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("生成服务没有返回文件内容");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((size += value.byteLength) > limit) throw new Error("生成服务响应超过大小限制");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** 提示词边界是服务端规则，各入口复用同一份校验。 */
export function creationPrompt(value: string): string {
  const prompt = value.trim();
  if (!prompt || prompt.length > 8000) throw new Error("提示词需在 1–8000 字符之间");
  return prompt;
}

/** 服务端唯一的能力门控：模型类型与会话槽位都使用同一个谓词。 */
export function assertCreationCapability(
  model: CreationModel,
  kind: CreationKind,
  refs: { reference?: unknown; firstFrame?: unknown; lastFrame?: unknown },
): void {
  if (model.kind !== kind) throw new Error("所选模型不可用于此次创作");
  if (refs.reference && kind !== "image") throw new Error("参考图只支持图片生成");
  if ((refs.firstFrame || refs.lastFrame) && kind !== "video")
    throw new Error("首尾帧仅支持视频生成");
  const slots = creationReferenceSlots(model);
  if (refs.reference && !slots.image) throw new Error("当前模型未配置图生图输入");
  if (refs.firstFrame && !slots.firstFrame) throw new Error("当前模型未配置首帧输入");
  if (refs.lastFrame && !slots.lastFrame) throw new Error("当前模型未配置尾帧输入");
}
