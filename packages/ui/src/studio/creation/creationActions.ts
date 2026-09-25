import type {
  CreateCreationJobInput,
  CreationJob,
  CreationOutput,
  CreationReuseDraft,
  CreationVerification,
  ICreationService,
} from "@knorvia/services";
import type { CreationEntryKey } from "./creationEntries.js";

/** 历史卡片上的一次显式用户动作；四个动作各自对应唯一的服务调用。 */
export type CreationActionRequest =
  | { action: "reuse"; job: CreationJob }
  | { action: "variant"; job: CreationJob }
  | { action: "reference"; job: CreationJob; output: CreationOutput }
  | { action: "verify"; job: CreationJob };

export type CreationActionResult =
  | { kind: "draft"; draft: CreationReuseDraft }
  | { kind: "submitted"; job: CreationJob }
  | { kind: "verified"; verification: CreationVerification };

export interface CreationActionPorts {
  /** 只使用既有服务方法，不新增第二条请求路径。 */
  creation: Pick<ICreationService, "reuseJob" | "createJob" | "verifyJob">;
  /** 读取被引用成果的字节；由调用方通过 IFileService 提供，界面不直接碰文件系统。 */
  readReference(
    output: CreationOutput,
  ): Promise<{ name: string; mimeType: string; dataBase64: string }>;
  /** 新意图的生成编号；同一次提交必须由 creationSubmit 复用原编号。 */
  newRequestId(): string;
}

export interface CreationActionPending {
  action: CreationEntryKey;
  jobId: string;
}

/** 变体把 reuseJob 的草稿原样回传：沿用同一份参数与来源关系，只换了编号。 */
export function creationJobInputFromDraft(draft: CreationReuseDraft): CreateCreationJobInput {
  return {
    requestId: draft.requestId,
    kind: draft.kind,
    modelId: draft.modelId,
    prompt: draft.prompt,
    provenance: draft.provenance,
    ...(draft.reference ? { reference: draft.reference } : {}),
    ...(draft.firstFrame ? { firstFrame: draft.firstFrame } : {}),
    ...(draft.lastFrame ? { lastFrame: draft.lastFrame } : {}),
  };
}

/** 作为参考继续生成：记录直接来源任务与被引用的成果编号，形成可追溯的生成链。 */
export function creationReferenceInput(input: {
  job: CreationJob;
  output: CreationOutput;
  requestId: string;
  reference: { name: string; mimeType: string; dataBase64: string };
}): CreateCreationJobInput {
  return {
    requestId: input.requestId,
    kind: input.job.kind,
    modelId: input.job.modelId,
    prompt: input.job.prompt,
    provenance: { parentJobId: input.job.id, referencedOutputId: input.output.id },
    reference: input.reference,
  };
}

/**
 * 执行一次入口动作。核验路径只调用 verifyJob，永不提交生成请求；
 * 复用路径只取得草稿，只有变体与参考路径会真正 createJob。
 */
export async function executeCreationAction(
  request: CreationActionRequest,
  ports: CreationActionPorts,
): Promise<CreationActionResult> {
  switch (request.action) {
    case "reuse":
      return { kind: "draft", draft: await ports.creation.reuseJob(request.job.id) };
    case "variant": {
      const draft = await ports.creation.reuseJob(request.job.id);
      return {
        kind: "submitted",
        job: await ports.creation.createJob(creationJobInputFromDraft(draft)),
      };
    }
    case "reference": {
      const reference = await ports.readReference(request.output);
      return {
        kind: "submitted",
        job: await ports.creation.createJob(
          creationReferenceInput({
            job: request.job,
            output: request.output,
            requestId: ports.newRequestId(),
            reference,
          }),
        ),
      };
    }
    case "verify":
      return { kind: "verified", verification: await ports.creation.verifyJob(request.job.id) };
  }
}
