import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { redactDiagnosticText } from "@knorvia/shared";
import type { CreateCreationJobInput, CreationModel } from "./contract.js";
import type { decodeReference, StoredJob } from "./creationStorage.js";

type Reference = NonNullable<ReturnType<typeof decodeReference>>;
export interface CreationReferences {
  reference?: Reference;
  firstFrame?: Reference;
  lastFrame?: Reference;
}

/** 同一 requestId 只能对应同一次生成内容，防止应答丢失后的重试被当作新请求。 */
export function sameCreationRequest(
  job: StoredJob,
  input: CreateCreationJobInput,
  refs: CreationReferences,
): boolean {
  return (
    job.kind === input.kind &&
    job.modelId === input.modelId &&
    job.prompt === input.prompt.trim() &&
    job.referenceHash === refs.reference?.hash &&
    job.firstFrameHash === refs.firstFrame?.hash &&
    job.lastFrameHash === refs.lastFrame?.hash
  );
}

export function newCreationJob(
  input: CreateCreationJobInput,
  model: CreationModel,
  prompt: string,
  refs: CreationReferences,
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
