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
  setDraftImages(sessionId: string, kernelId: StudioKernelId, images: StudioImageInput[]): boolean;
  removeDraftImage(sessionId: string, id: string): void;
  sealImageSubmission(
    sessionId: string,
    service: IStudioRuntimeService,
    command: StudioCommand,
  ): void;
  rejectImages(sessionId: string, commandId: string): void;
  acknowledgeImages(sessionId: string, commandId: string): void;
}
export function createStudioImageDraftActions(
  get: () => StudioAgentData & StudioImageDraftActions,
  set: (state: Partial<StudioImageDraftActions>) => void,
  persist: (data: Pick<StudioAgentData, "configs" | "drafts">) => boolean,
  fail: (error: "invalid-session" | "draft-limit") => false,
): StudioImageDraftActions {
  return {
    pendingImages: {},
    setDraftImages(sessionId, kernelId, images) {
      if (kernelId !== "codex" || !isStudioDraftSessionId(sessionId))
        return fail("invalid-session");
      validateStudioImageInputs(images);
      const state = get();
      const previous = state.drafts[sessionId];
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
            updatedAt: Date.now(),
          },
        },
      });
    },
    removeDraftImage(sessionId, id) {
      const state = get(),
        draft = state.drafts[sessionId];
      if (!draft) return;
      persist({
        configs: state.configs,
        drafts: {
          ...state.drafts,
          [sessionId]: {
            ...draft,
            images: draft.images?.filter((v) => v.id !== id),
            updatedAt: Date.now(),
          },
        },
      });
    },
    sealImageSubmission(sessionId, service, command) {
      if (command.type !== "send" || !command.attachments?.length) throw new Error("无效图片提交");
      const state = get(),
        draft = state.drafts[sessionId];
      if (!draft || state.pendingImages[sessionId] || draft.imageSubmission)
        throw new Error("此图片提交仍在等待确认");
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
    rejectImages(sessionId, commandId) {
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
    acknowledgeImages(sessionId, commandId) {
      const state = get(),
        draft = state.drafts[sessionId];
      if (draft?.imageSubmission?.commandId !== commandId) return;
      const submitted = draft.imageSubmission;
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
            images: draft.images?.filter((image) => !submitted.imageIds.includes(image.id)),
            imageSubmission: undefined,
            updatedAt: Date.now(),
          },
        },
      });
    },
  };
}
