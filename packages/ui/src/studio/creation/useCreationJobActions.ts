import { useCallback, useRef, useState } from "react";
import type {
  CreationJob,
  CreationReuseDraft,
  CreationVerification,
  ICreationService,
} from "@knorvia/services";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import {
  executeCreationAction,
  type CreationActionPending,
  type CreationActionRequest,
} from "./creationActions.js";
import { CREATION_REFERENCE_MAX_BYTES } from "./creationInput.js";

export interface CreationActionHandlers {
  /** 沿用参数：把复用草稿回填输入区，不自动提交。 */
  onDraft(draft: CreationReuseDraft): void;
  /** 变体／作为参考继续生成：服务端已接纳的新任务。 */
  onJob(job: CreationJob): void;
  /** 核验远端结果：只读结果与 checkedAt，界面不另存任务状态。 */
  onVerified(verification: CreationVerification): void;
  /** 动作失败时按任务挂回卡片，避免把卡片上的拒绝理由推到底部输入区。 */
  onError(message: string, jobId: string): void;
}

/**
 * 历史卡片动作的 React 绑定层：判定与请求构造都在 creationActions/creationEntries 里，
 * 这里只负责串行化一次动作、读取成果字节并把结果交回页面。
 */
export function useCreationJobActions(
  creation: ICreationService | undefined,
  handlers: CreationActionHandlers,
): { pending: CreationActionPending | null; run(request: CreationActionRequest): Promise<void> } {
  const files = useBaseWorkspaceServices().fileService;
  const [pending, setPending] = useState<CreationActionPending | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const run = useCallback(
    async (request: CreationActionRequest) => {
      if (!creation || pending) return;
      setPending({ action: request.action, jobId: request.job.id });
      handlersRef.current.onError("", request.job.id);
      try {
        const result = await executeCreationAction(request, {
          creation,
          newRequestId: () => crypto.randomUUID(),
          readReference: async (output) => ({
            name: output.name,
            mimeType: output.mimeType,
            dataBase64: (
              await files.readBinaryPreview({
                path: output.path,
                maxBytes: CREATION_REFERENCE_MAX_BYTES,
              })
            ).dataBase64,
          }),
        });
        if (result.kind === "draft") handlersRef.current.onDraft(result.draft);
        else if (result.kind === "submitted") handlersRef.current.onJob(result.job);
        else handlersRef.current.onVerified(result.verification);
      } catch (cause) {
        handlersRef.current.onError(
          cause instanceof Error ? cause.message : String(cause),
          request.job.id,
        );
      } finally {
        setPending(null);
      }
    },
    [creation, files, pending],
  );

  return { pending, run };
}
