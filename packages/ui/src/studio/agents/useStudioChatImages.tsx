import type { ComponentProps } from "react";
import type { ChatPromptEditor } from "@/prompt-editor/ChatPromptEditor.js";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  requireStudioImageModel,
  type StudioImageInput,
  type StudioKernelConfig,
  type StudioChatSelection,
} from "@knorvia/services";
import { studioAgentStore, useStudioAgentStore } from "@/store/studioAgentStore.js";
import { Button } from "@/components/ui/button.js";
import { captureStudioImage } from "./imageCapture.js";
import { StudioImageAttachments } from "./StudioImageAttachments.js";
import { resolveStudioChatSelection } from "./chatSelections.js";
import type { StudioExternalDraft } from "./agentDrafts.js";
import type { StudioKernelId } from "../types.js";
import type { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import type { useStudioChatOptions } from "./useStudioChatOptions.js";
import type { ChatSubmissionCommand } from "./chatSubmission.js";
export function useStudioChatImages({
  sessionId,
  kernelId,
  workspacePath,
  selection,
  conversationSelection,
  config,
  modelOptions,
  runtime,
  draft,
  zh,
  mounted,
  setError,
}: {
  sessionId: string;
  kernelId: StudioKernelId;
  workspacePath: string;
  selection: StudioChatSelection;
  conversationSelection?: StudioChatSelection;
  config?: StudioKernelConfig;
  modelOptions: ReturnType<typeof useStudioChatOptions>;
  runtime: ReturnType<typeof useStudioRuntime>;
  draft?: StudioExternalDraft;
  zh: boolean;
  mounted: MutableRefObject<boolean>;
  setError: (value: string) => void;
}) {
  const images = draft?.images ?? [];
  const pendingImage = useStudioAgentStore((state) => state.pendingImages[sessionId]);
  const [capturing, setCapturing] = useState(false);
  const captureGeneration = useRef(0);
  const currentScope = useRef("");
  const currentConnection = useRef(runtime.connectionKey);
  currentConnection.current = runtime.connectionKey;
  const selectionKey = JSON.stringify(selection);
  const currentKey = JSON.stringify([
    sessionId,
    kernelId,
    workspacePath,
    runtime.connectionKey,
    selectionKey,
  ]);
  currentScope.current = currentKey;
  useEffect(() => {
    // 修复：同会话换模型/连接也会使读取失效；成功、错误和结束必须共用同一 scope。
    setCapturing(false);
    return () => {
      captureGeneration.current++;
    };
  }, [currentKey]);
  useEffect(() => {
    const commandId = draft?.imageSubmission?.commandId;
    if (
      commandId &&
      mounted.current &&
      currentConnection.current === runtime.connectionKey &&
      runtime.service &&
      pendingImage?.service === runtime.service &&
      pendingImage.command.commandId === commandId &&
      runtime.overview?.runs.some(
        (run) => run.targetId === sessionId && run.admissionCommandId === commandId,
      )
    )
      studioAgentStore.getState().acknowledgeImages(sessionId, commandId, runtime.service);
  }, [
    draft?.imageSubmission?.commandId,
    pendingImage,
    runtime.connectionKey,
    runtime.overview,
    runtime.service,
    sessionId,
  ]);
  useEffect(() => {
    const commandId = draft?.imageSubmission?.commandId;
    const service = runtime.service,
      connection = runtime.connectionKey;
    if (
      !commandId ||
      !service ||
      pendingImage?.service !== service ||
      pendingImage.command.commandId !== commandId
    )
      return;
    let current = true;
    // 回执查找只读、绑定 target/CID；历史分页淘汰与换连接都不能触发新执行。
    void service.timeline(sessionId, undefined, undefined, undefined, commandId).then(
      (result) => {
        if (
          current &&
          mounted.current &&
          currentConnection.current === connection &&
          result.admission?.commandId === commandId
        )
          studioAgentStore.getState().acknowledgeImages(sessionId, commandId, service);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [
    draft?.imageSubmission?.commandId,
    pendingImage,
    runtime.connectionKey,
    runtime.service,
    sessionId,
  ]);
  const capture = async (files: File[]) => {
    if (!files.length || capturing) return;
    const generation = ++captureGeneration.current;
    const key = currentKey;
    setCapturing(true);
    setError("");
    try {
      if (kernelId !== "codex")
        throw new Error(zh ? "贴图仅支持本地 Codex" : "Images are supported only by local Codex");
      requireStudioImageModel(modelOptions.options, selection.model);
      // 整批有界读取；捕获期间换模型/会话或取消时，晚到的字节不会进入新草稿。
      if (files.length > 4) throw new Error(zh ? "最多添加 4 张图片" : "Add at most 4 images");
      const captured: StudioImageInput[] = [];
      for (const file of files) captured.push(await captureStudioImage(file));
      if (
        !mounted.current ||
        generation !== captureGeneration.current ||
        currentScope.current !== key
      )
        return;
      const previous = studioAgentStore.getState().drafts[sessionId]?.images ?? [];
      if (previous.some((image) => !image.dataBase64))
        throw new Error(zh ? "请先移除失效图片" : "Remove unavailable images first");
      const unique = new Map(previous.map((image) => [image.sha256, image as StudioImageInput]));
      for (const image of captured) if (!unique.has(image.sha256)) unique.set(image.sha256, image);
      studioAgentStore
        .getState()
        .setDraftImages(sessionId, kernelId, [...unique.values()], runtime.service!);
    } catch (cause) {
      if (
        mounted.current &&
        generation === captureGeneration.current &&
        currentScope.current === key
      )
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (
        mounted.current &&
        generation === captureGeneration.current &&
        currentScope.current === key
      )
        setCapturing(false);
    }
  };
  const isCurrent = () =>
    mounted.current &&
    currentScope.current === currentKey &&
    JSON.stringify(
      resolveStudioChatSelection(
        studioAgentStore.getState().drafts[sessionId]?.selection,
        conversationSelection,
        config,
      ),
    ) === selectionKey;
  const retry = async () => {
    if (draft?.imageSubmission) {
      if (!pendingImage || pendingImage.service !== runtime.service)
        throw new Error(
          pendingImage
            ? zh
              ? `原请求 ${draft.imageSubmission.commandId} 归属另一执行连接；请查看原 Host 运行记录或新建独立会话，不要重发。`
              : `Submission ${draft.imageSubmission.commandId} belongs to another Host connection. Inspect the original Host run history or start a separate conversation; do not resend.`
            : zh
              ? `原请求 ${draft.imageSubmission.commandId} 仍未确认，原图片字节已不可恢复；请查看原 Host 运行记录或新建独立会话，不会自动重发。`
              : `Submission ${draft.imageSubmission.commandId} remains unconfirmed and original image bytes are unavailable. Inspect the original Host run history or start a separate conversation; no automatic resend.`,
        );
      const service = pendingImage.service,
        connection = runtime.connectionKey;
      const result = await runtime.executePrepared(pendingImage.command);
      if (result.imageRejection) {
        if (mounted.current && currentConnection.current === connection)
          studioAgentStore
            .getState()
            .rejectImages(sessionId, pendingImage.command.commandId, service);
        throw new Error(result.imageRejection);
      }
      if (mounted.current && currentConnection.current === connection)
        studioAgentStore
          .getState()
          .acknowledgeImages(sessionId, pendingImage.command.commandId, service);
      return true;
    }
    return false;
  };
  const assertSend = () => {
    if (images.length) {
      if (kernelId !== "codex")
        throw new Error(zh ? "贴图仅支持本地 Codex" : "Images are supported only by local Codex");
      requireStudioImageModel(modelOptions.options, selection.model);
      if (images.some((image) => !image.dataBase64))
        throw new Error(
          zh ? "图片内容已失效，请重新添加" : "Image content unavailable; add it again",
        );
      if (!runtime.service || draft?.imageOwnerService !== runtime.service)
        throw new Error(
          zh
            ? "图片属于另一 Host 或归属无法确认，请返回原连接或移除后重新添加"
            : "Images belong to another Host or ownership is unknown; return to the original connection or remove and add them again",
        );
    }
  };
  const command = async (input: ChatSubmissionCommand) => {
    if (input.type !== "send" || !input.attachments?.length) return runtime.command(input);
    const command = runtime.prepareCommand({
      ...input,
      imageModel: requireStudioImageModel(modelOptions.options, input.selection?.model),
      kernelConfig: { ...(config ?? { executablePath: "", permission: "ask" as const }) },
    });
    const service = runtime.service!,
      connection = runtime.connectionKey;
    studioAgentStore.getState().sealImageSubmission(sessionId, service, command);
    const result = await runtime.executePrepared(command);
    if (result.imageRejection) {
      if (mounted.current && currentConnection.current === connection)
        studioAgentStore.getState().rejectImages(sessionId, command.commandId, service);
      throw new Error(result.imageRejection);
    }
    // 修复：直接返回也绑定原连接；A 的迟到结果不能清除当前 B scope 的草稿。
    if (mounted.current && currentConnection.current === connection)
      studioAgentStore.getState().acknowledgeImages(sessionId, command.commandId, service);
    return result;
  };
  const content = (
    <>
      {images.length > 0 && (
        <StudioImageAttachments
          images={images}
          zh={zh}
          onRemove={(id) => {
            captureGeneration.current++;
            setCapturing(false);
            studioAgentStore.getState().removeDraftImage(sessionId, id);
          }}
        />
      )}
      {capturing && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            captureGeneration.current++;
            setCapturing(false);
          }}
        >
          {zh ? "取消读取图片" : "Cancel image reading"}
        </Button>
      )}
      {draft?.imageSubmission && (
        <p role="status" className="px-3 py-1 text-ui-xs text-foreground-subtle">
          {!pendingImage
            ? zh
              ? `原 Host 归属无法确认；请求 ${draft.imageSubmission.commandId} 仍未知，原图片字节已不可恢复。请查看原 Host 运行记录或新建独立会话，不会自动重发。`
              : `Original Host ownership cannot be verified; submission ${draft.imageSubmission.commandId} remains unconfirmed and original image bytes are unavailable. Inspect the original Host run history or start a separate conversation. No automatic resend.`
            : pendingImage.service !== runtime.service
              ? zh
                ? `原请求 ${draft.imageSubmission.commandId} 属于另一 Host 连接；请查看原 Host 运行记录或新建独立会话，当前连接不会重发。`
                : `Submission ${draft.imageSubmission.commandId} belongs to another Host connection. Inspect the original Host run history or start a separate conversation; this connection will not resend it.`
              : zh
                ? "已发送，等待 Host 确认；重试将使用原图片和请求编号。"
                : "Sent; awaiting Host confirmation. Retry uses the original images and request ID."}
        </p>
      )}
    </>
  );
  const editorProps: Pick<
    ComponentProps<typeof ChatPromptEditor>,
    "allowSubmitWhenEmpty" | "enableExternalFileDrop" | "onPaste" | "onDrop" | "topContent"
  > = {
    allowSubmitWhenEmpty: Boolean(images.length || draft?.imageSubmission),
    enableExternalFileDrop: true,
    topContent: content,
    onPaste: (event) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      void capture(files);
    },
    onDrop: (event) => {
      const files = Array.from(event.dataTransfer.files);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      void capture(files);
    },
  };
  return { images, capturing, retry, assertSend, command, isCurrent, editorProps };
}
