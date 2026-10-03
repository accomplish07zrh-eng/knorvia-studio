import { stat } from "node:fs/promises";
import { Emitter } from "@knorvia/rpc";
import type {
  IPromptAttachmentTransferService,
  PromptAttachmentStageParams,
  PromptAttachmentStageResult,
  PromptAttachmentTransferProgress,
} from "./promptAttachmentTransfer.js";

export function createLocalPromptAttachmentTransferService(): IPromptAttachmentTransferService {
  const progressEmitters = new Map<string, Emitter<PromptAttachmentTransferProgress>>();

  return {
    async stage(params: PromptAttachmentStageParams): Promise<PromptAttachmentStageResult> {
      const bytes =
        typeof params.sizeBytes === "number" && params.sizeBytes > 0
          ? params.sizeBytes
          : await stat(params.localPath)
              .then((stats) => stats.size)
              .catch(() => 0);

      return {
        operationId: params.operationId,
        ref: params.localPath,
        bytes,
        staged: false,
      };
    },
    async adopt() {},
    async cancel() {},
    async cleanup() {},
    onDynamicProgress(operationId: string) {
      const existingEmitter = progressEmitters.get(operationId);
      if (existingEmitter) {
        return existingEmitter.event;
      }

      const emitter = new Emitter<PromptAttachmentTransferProgress>({
        onDidRemoveLastListener: () => {
          progressEmitters.delete(operationId);
          emitter.dispose();
        },
      });
      progressEmitters.set(operationId, emitter);
      return emitter.event;
    },
  };
}
