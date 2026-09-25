import type { CreationKind, CreationProvenance } from "@knorvia/services";
import { CREATION_SLOTS, type CreationFiles } from "./creationInput.js";

export interface CreationSubmission {
  /** 提交内容的签名；签名与参考图都没变才算同一次提交。 */
  signature: string;
  requestId: string;
  files: CreationFiles;
}

/**
 * 幂等签名把服务端会参与比较的内容都算进去：类型、模型、提示词与来源关系。
 * 服务端（sameCreationRequest）按同样的口径判定两份提交是否相同。
 */
export function creationSubmissionSignature(input: {
  kind: CreationKind;
  modelId: string;
  prompt: string;
  provenance?: CreationProvenance;
}): string {
  return JSON.stringify([input.kind, input.modelId, input.prompt.trim(), input.provenance ?? null]);
}

/**
 * 同一次提交复用同一个 requestId：签名与参考图文件都没变时沿用原编号，
 * 否则视为新的生成意图并使用调用方给出的新编号。
 */
export function resolveCreationSubmission(
  previous: CreationSubmission | null,
  next: { signature: string; files: CreationFiles; requestId: string },
): { submission: CreationSubmission; reused: boolean } {
  const reused =
    previous !== null &&
    previous.signature === next.signature &&
    CREATION_SLOTS.every((slot) => previous.files[slot] === next.files[slot]);
  return {
    reused,
    submission: reused
      ? previous
      : { signature: next.signature, requestId: next.requestId, files: next.files },
  };
}
