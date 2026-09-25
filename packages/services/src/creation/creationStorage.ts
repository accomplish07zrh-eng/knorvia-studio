import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { redactDiagnosticText } from "@knorvia/shared";
import { creationOutputFormat, creationReferenceSlots } from "./contract.js";
import type {
  CreateCreationJobInput,
  CreationJob,
  CreationKind,
  CreationModel,
  CreationOutput,
  CreationProvenance,
  CreationReuseDraft,
} from "./contract.js";

export interface StoredJob extends CreationJob {
  providerTaskId?: string;
  referencePath?: string;
  referenceMimeType?: string;
  referenceHash?: string;
  firstFramePath?: string;
  firstFrameMimeType?: string;
  firstFrameHash?: string;
  lastFramePath?: string;
  lastFrameMimeType?: string;
  lastFrameHash?: string;
}

interface CreationFile<T> {
  version: 1;
  items: T[];
}

export async function readRecords<T>(path: string): Promise<T[]> {
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

export async function writeRecords<T>(path: string, items: T[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, items } satisfies CreationFile<T>), {
    mode: 0o600,
  });
  try {
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

/** 来源关系只接受三个白名单键；格式错误直接拒绝，未知键忽略。 */
export function creationProvenance(value?: CreationProvenance): CreationProvenance | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result: CreationProvenance = {};
  for (const key of ["parentJobId", "referencedOutputId", "repeatOfRequestId"] as const) {
    const candidate = value[key];
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate !== "string" || !/^[\w-]{1,100}$/.test(candidate.trim()))
      throw new Error(`来源信息 ${key} 无效`);
    result[key] = candidate.trim();
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 重启恢复：上次退出时仍未完成的任务结果未知，改为中断并说明远端可能仍在计费。
 * 这里只改状态，不自动重复提交任何已可能计费的请求。
 */
export async function recoverInterruptedJobs(jobsPath: string): Promise<void> {
  const jobs = await readRecords<StoredJob>(jobsPath);
  let changed = false;
  for (const job of jobs) {
    if (job.status !== "queued" && job.status !== "running") continue;
    job.status = "interrupted";
    job.updatedAt = new Date().toISOString();
    job.error = "应用上次退出时任务仍在运行；结果未知。请检查生成服务，再决定是否重新创建。";
    changed = true;
  }
  if (changed) await writeRecords(jobsPath, jobs);
}

/** 参考图与首尾帧的落盘事务：任一写入失败时清理本次已写入的文件。 */
export async function commitJobReferences(
  rootDir: string,
  job: StoredJob,
  refs: CreationReferenceInputs,
  commit: () => Promise<void>,
): Promise<void> {
  const written: string[] = [];
  try {
    for (const [slot, item] of [
      ["reference", refs.reference],
      ["firstFrame", refs.firstFrame],
      ["lastFrame", refs.lastFrame],
    ] as const) {
      if (!item) continue;
      const path = join(rootDir, "references", `${job.id}-${slot}.${item.extension}`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, item.bytes, { flag: "wx", mode: 0o600 });
      written.push(path);
      if (slot === "reference") job.referencePath = path;
      if (slot === "firstFrame") job.firstFramePath = path;
      if (slot === "lastFrame") job.lastFramePath = path;
    }
    await commit();
  } catch (error) {
    await Promise.all(written.map((path) => rm(path, { force: true }).catch(() => undefined)));
    throw error;
  }
}

export interface CreationReferenceInputs {
  reference?: { bytes: Uint8Array; extension: string };
  firstFrame?: { bytes: Uint8Array; extension: string };
  lastFrame?: { bytes: Uint8Array; extension: string };
}

/**
 * 已提交后遇到取消或网络类错误时，远端可能仍在运行或计费，只能记为结果未知；
 * 其余错误去掉密钥后作为明确失败。
 */
export function creationFailure(
  error: unknown,
  options: { apiKey: string | null; aborted: boolean; submissionStarted: boolean },
): Pick<StoredJob, "status" | "error"> {
  const raw = error instanceof Error ? error.message : String(error);
  const unknown =
    options.aborted ||
    (options.submissionStarted &&
      (error instanceof TypeError ||
        /(?:network|fetch|ECONNRESET|ETIMEDOUT|socket hang up|超时|生成服务返回 5\d{2})/i.test(
          raw,
        )));
  if (unknown)
    return {
      status: "interrupted",
      error: "生成请求可能已经提交，但未取得确定结果；远端可能继续运行或计费。请先检查生成服务。",
    };
  const safe = redactDiagnosticText(
    options.apiKey ? raw.replaceAll(options.apiKey, "[redacted]") : raw,
  );
  return { status: "failed", error: safe.slice(0, 500) };
}

/**
 * 判断记录层参数是否足以重建这次提交。
 * 只做同步的字段一致性检查；参考图文件是否存在、哈希是否仍一致由 reuseJob 与工作流交接再校验。
 */
export function creationSnapshotState(job: StoredJob): {
  reconstructible: boolean;
  missing: string[];
} {
  const snapshot = job.parameterSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return { reconstructible: false, missing: ["parameterSnapshot"] };
  const missing: string[] = [];
  const params = snapshot.params;
  if (snapshot.kind !== job.kind) missing.push("parameterSnapshot.kind");
  if (snapshot.modelId !== job.modelId) missing.push("parameterSnapshot.modelId");
  if (snapshot.prompt !== job.prompt) missing.push("parameterSnapshot.prompt");
  if (!snapshot.modelName?.trim()) missing.push("parameterSnapshot.modelName");
  if (!snapshot.protocol) missing.push("parameterSnapshot.protocol");
  if (!snapshot.capturedAt?.trim()) missing.push("parameterSnapshot.capturedAt");
  if (!params || params.prompt !== job.prompt) missing.push("parameterSnapshot.params.prompt");
  if (!params?.model?.trim()) missing.push("parameterSnapshot.params.model");
  if (job.referenceHash && snapshot.referenceHash !== job.referenceHash)
    missing.push("parameterSnapshot.referenceHash");
  if (job.firstFrameHash && snapshot.firstFrameHash !== job.firstFrameHash)
    missing.push("parameterSnapshot.firstFrameHash");
  if (job.lastFrameHash && snapshot.lastFrameHash !== job.lastFrameHash)
    missing.push("parameterSnapshot.lastFrameHash");
  return { reconstructible: missing.length === 0, missing };
}

export function validId(value: string): string {
  if (!/^[\w-]{1,100}$/.test(value)) throw new Error("无效的创作记录编号");
  return value;
}

/**
 * 成果文件的唯一写入路径：提交成功与只读验证恢复共用。
 * 文件已存在时不覆盖，而是按磁盘上的真实内容重新计算类型、大小与哈希。
 */
export async function writeCreationOutput(
  rootDir: string,
  jobId: string,
  result: { bytes: Uint8Array; extension: string },
  kind: CreationKind,
): Promise<{ output: CreationOutput; created: boolean }> {
  const path = join(rootDir, "assets", `creation-${jobId}.${result.extension}`);
  await mkdir(dirname(path), { recursive: true });
  let created = false;
  try {
    await writeFile(path, result.bytes, { flag: "wx", mode: 0o600 });
    created = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const bytes = await readFile(path);
  const format = creationOutputFormat(bytes, kind);
  return {
    created,
    output: {
      id: randomUUID(),
      name: basename(path),
      mimeType: format.mimeType,
      path,
      size: bytes.byteLength,
      hash: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

export interface CreationReuseContext {
  rootDir: string;
  jobsPath: string;
  modelsPath: string;
}

/**
 * 从存储记录重建一份可提交草稿：新编号、无副作用。
 * 只读取任务记录与已落盘的参考图（校验哈希），不写盘、不提交供应商请求。
 */
export async function reuseStoredJob(
  context: CreationReuseContext,
  id: string,
): Promise<CreationReuseDraft> {
  validId(id);
  const jobs = await readRecords<StoredJob>(context.jobsPath);
  const source = jobs.find((job) => job.id === id);
  if (!source) throw new Error("创作任务不存在");
  if (source.status === "queued" || source.status === "running")
    throw new Error("任务仍在进行中；请等待结束或取消后再复用");
  const models = await readRecords<CreationModel>(context.modelsPath);
  const model = models.find((item) => item.id === source.modelId);
  if (!model || !model.enabled || model.kind !== source.kind)
    throw new Error("原任务的模型已不存在或不可用，无法复用");
  // 能力门控复用服务端同一个谓词，避免各入口自行判断协议字符串。
  const slots = creationReferenceSlots(model);
  if (source.referenceHash && !slots.image)
    throw new Error("当前模型未配置图生图输入，无法复用原任务参考图");
  if (source.firstFrameHash && !slots.firstFrame)
    throw new Error("当前模型未配置首帧输入，无法复用原任务首帧");
  if (source.lastFrameHash && !slots.lastFrame)
    throw new Error("当前模型未配置尾帧输入，无法复用原任务尾帧");
  const reference = await savedReference(
    context.rootDir,
    source.referencePath,
    source.referenceName,
    source.referenceMimeType,
    source.referenceHash,
  );
  const firstFrame = await savedReference(
    context.rootDir,
    source.firstFramePath,
    source.firstFrameName,
    source.firstFrameMimeType,
    source.firstFrameHash,
  );
  const lastFrame = await savedReference(
    context.rootDir,
    source.lastFramePath,
    source.lastFrameName,
    source.lastFrameMimeType,
    source.lastFrameHash,
  );
  const publicSource = publicJob(source);
  const requestId = `reuse-${source.id}-${randomUUID().slice(0, 8)}`.slice(0, 100);
  return {
    requestId,
    kind: source.kind,
    modelId: source.modelId,
    prompt: source.prompt,
    provenance: { parentJobId: source.id, repeatOfRequestId: source.requestId },
    missing: publicSource.missing ?? ["parameterSnapshot"],
    previousResultUnknown: source.status === "interrupted" || source.status === "cancelled",
    ...(reference ? { reference } : {}),
    ...(firstFrame ? { firstFrame } : {}),
    ...(lastFrame ? { lastFrame } : {}),
    ...(publicSource.parameterSnapshot
      ? { parameterSnapshot: publicSource.parameterSnapshot }
      : {}),
  };
}

export function publicJob(job: StoredJob): CreationJob {
  const {
    providerTaskId: _privateTaskId,
    referencePath: _referencePath,
    referenceMimeType: _referenceMimeType,
    referenceHash: _referenceHash,
    firstFramePath: _firstFramePath,
    firstFrameMimeType: _firstFrameMimeType,
    firstFrameHash: _firstFrameHash,
    lastFramePath: _lastFramePath,
    lastFrameMimeType: _lastFrameMimeType,
    lastFrameHash: _lastFrameHash,
    ...visible
  } = job;
  const state = creationSnapshotState(job);
  return { ...visible, reconstructible: state.reconstructible, missing: state.missing };
}

export function decodeReference(
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

export async function savedReference(
  rootDir: string,
  path?: string,
  name?: string,
  mimeType?: string,
  expectedHash?: string,
) {
  if (!path && !name && !mimeType && !expectedHash) return undefined;
  if (!path || !name || !mimeType || !expectedHash)
    throw new Error("原任务参考图记录不完整，不能安全重试");
  let root: string;
  let target: string;
  try {
    root = await realpath(join(rootDir, "references"));
    target = await realpath(path);
  } catch {
    throw new Error("原任务参考图无法读取，不能安全重试");
  }
  const within = relative(root, target);
  if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within))
    throw new Error("原任务参考图路径不属于创作数据目录");
  let bytes: Buffer;
  try {
    if ((await stat(target)).size > 10 * 1024 * 1024) throw new Error("原任务参考图超过大小限制");
    bytes = await readFile(target);
  } catch (error) {
    if (error instanceof Error && error.message === "原任务参考图超过大小限制") throw error;
    throw new Error("原任务参考图无法读取，不能安全重试");
  }
  if (createHash("sha256").update(bytes).digest("hex") !== expectedHash)
    throw new Error("原任务参考图已变化，不能安全重试");
  return { name, mimeType, dataBase64: bytes.toString("base64") };
}
