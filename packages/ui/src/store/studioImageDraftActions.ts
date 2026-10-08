import {
  validateStudioImageInputs,
  type StudioImageInput,
  type StudioCommand,
  type IStudioRuntimeService,
} from "@knorvia/services";
import {
  isStudioDraftSessionId,
  STUDIO_DRAFT_COUNT_LIMIT,
  type StudioAgentData,
} from "../studio/agents/agentDrafts.js";
import type { StudioKernelId } from "../studio/types.js";
export interface StudioImageDraftActions {
  pendingImages: Record<string, { service: IStudioRuntimeService; command: StudioCommand }>;
  setDraftImages(
    sessionId: string,
    kernelId: StudioKernelId,
    images: StudioImageInput[],
    service: IStudioRuntimeService,
  ): boolean;
  removeDraftImage(sessionId: string, id: string): void;
  sealImageSubmission(
    sessionId: string,
    service: IStudioRuntimeService,
    command: StudioCommand,
  ): void;
  rejectImages(sessionId: string, commandId: string, service: IStudioRuntimeService): void;
  acknowledgeImages(sessionId: string, commandId: string, service: IStudioRuntimeService): void;
}
export function createStudioImageDraftActions(
  get: () => StudioAgentData & StudioImageDraftActions,
  set: (state: Partial<StudioImageDraftActions>) => void,
  persist: (data: Pick<StudioAgentData, "configs" | "drafts">) => boolean,
  fail: (error: "invalid-session" | "draft-limit") => false,
): StudioImageDraftActions {
  const ownsSubmission = (sessionId: string, commandId: string, service: IStudioRuntimeService) => {
    const state = get(),
      pending = state.pendingImages[sessionId],
      draft = state.drafts[sessionId];
    // 修复：同 target/CID 的别的 Host 不是回执来源；所有清稿入口共用唯一 store 校验。
    return Boolean(
      service &&
      pending?.service === service &&
      pending.command.commandId === commandId &&
      pending.command.type === "send" &&
      pending.command.targetId === sessionId &&
      draft?.imageSubmission?.commandId === commandId &&
      (!draft.images?.length || draft.imageOwnerService === service),
    );
  };
  return {
    pendingImages: {},
    setDraftImages(sessionId, kernelId, images, service) {
      if (kernelId !== "codex" || !isStudioDraftSessionId(sessionId))
        return fail("invalid-session");
      validateStudioImageInputs(images);
      const state = get();
      const previous = state.drafts[sessionId];
      if (!service || (previous?.images?.length && previous.imageOwnerService !== service))
        throw new Error(
          "图片属于另一 Host 或归属无法确认；请返回原连接或移除后重新添加 / Images belong to another Host or ownership is unknown",
        );
      if (previous && previous.kernelId !== kernelId) return fail("invalid-session");
      if (!previous && Object.keys(state.drafts).length >= STUDIO_DRAFT_COUNT_LIMIT)
        return fail("draft-limit");
      const retained = new Map(images.map((image) => [image.id, image.sizeBytes]));
      for (const [id, draft] of Object.entries(state.drafts))
        for (const image of id === sessionId ? images : (draft.images ?? []))
          if (image.dataBase64) retained.set(image.id, image.sizeBytes);
      for (const pending of Object.values(state.pendingImages))
        if (pending.command.type === "send")
          for (const image of pending.command.attachments ?? [])
            retained.set(image.id, image.sizeBytes);
      if ([...retained.values()].reduce((a, b) => a + b, 0) > 16 * 1024 * 1024)
        throw new Error("未发送图片总计超过 16 MiB / Unsent images exceed 16 MiB");
      return persist({
        configs: state.configs,
        drafts: {
          ...state.drafts,
          [sessionId]: {
            ...previous,
            sessionId,
            kernelId,
            text: previous?.text ?? "",
            images: images.map((v) => Object.freeze({ ...v })),
            imageOwnerService: images.length ? service : undefined,
            updatedAt: Date.now(),
          },
        },
      });
    },
    removeDraftImage(sessionId, id) {
      const state = get(),
        draft = state.drafts[sessionId];
      if (!draft) return;
      const images = draft.images?.filter((v) => v.id !== id);
      persist({
        configs: state.configs,
        drafts: {
          ...state.drafts,
          [sessionId]: {
            ...draft,
            images,
            imageOwnerService: images?.length ? draft.imageOwnerService : undefined,
            updatedAt: Date.now(),
          },
        },
      });
    },
    sealImageSubmission(sessionId, service, command) {
      if (
        command.type !== "send" ||
        command.kind !== "chat" ||
        command.targetId !== sessionId ||
        !command.attachments?.length
      )
        throw new Error("无效图片提交");
      const state = get(),
        draft = state.drafts[sessionId];
      if (!draft || state.pendingImages[sessionId] || draft.imageSubmission)
        throw new Error("此图片提交仍在等待确认");
      if (!service || draft.imageOwnerService !== service)
        throw new Error(
          "图片属于另一 Host 或归属无法确认；当前连接不能发送 / Image Host ownership cannot be verified",
        );
      validateStudioImageInputs(command.attachments);
      if (
        command.attachments.length !== draft.images?.length ||
        command.attachments.some((image, index) => {
          const captured = draft.images?.[index];
          return (
            !captured ||
            Object.entries(image).some(
              ([key, value]) => captured[key as keyof typeof captured] !== value,
            )
          );
        })
      )
        throw new Error("无效图片提交：捕获版本已改变");
      set({ pendingImages: { ...state.pendingImages, [sessionId]: { service, command } } });
      persist({
        configs: state.configs,
        drafts: {
          ...state.drafts,
          [sessionId]: {
            ...draft,
            imageSubmission: {
              commandId: command.commandId,
              text: command.text,
              imageIds: command.attachments.map((v) => v.id),
            },
          },
        },
      });
    },
    rejectImages(sessionId, commandId, service) {
      if (!ownsSubmission(sessionId, commandId, service)) return;
      const state = get(),
        draft = state.drafts[sessionId];
      if (draft?.imageSubmission?.commandId !== commandId) return;
      const pendingImages = { ...state.pendingImages };
      delete pendingImages[sessionId];
      set({ pendingImages });
      persist({
        configs: state.configs,
        drafts: { ...state.drafts, [sessionId]: { ...draft, imageSubmission: undefined } },
      });
    },
    acknowledgeImages(sessionId, commandId, service) {
      if (!ownsSubmission(sessionId, commandId, service)) return;
      const state = get(),
        draft = state.drafts[sessionId];
      if (draft?.imageSubmission?.commandId !== commandId) return;
      const submitted = draft.imageSubmission;
      const images = draft.images?.filter((image) => !submitted.imageIds.includes(image.id));
      const pendingImages = { ...state.pendingImages };
      delete pendingImages[sessionId];
      set({ pendingImages });
      persist({
        configs: state.configs,
        drafts: {
          ...state.drafts,
          [sessionId]: {
            ...draft,
            text: draft.text === submitted.text ? "" : draft.text,
            images,
            imageOwnerService: images?.length ? draft.imageOwnerService : undefined,
            imageSubmission: undefined,
            updatedAt: Date.now(),
          },
        },
      });
    },
  };
}
