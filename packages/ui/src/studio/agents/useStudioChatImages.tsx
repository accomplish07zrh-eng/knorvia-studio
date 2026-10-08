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
      runtime.overview?.runs.some(
        (run) => run.targetId === sessionId && run.admissionCommandId === commandId,
      )
    )
      studioAgentStore.getState().acknowledgeImages(sessionId, commandId);
  }, [draft?.imageSubmission?.commandId, runtime.overview, sessionId]);
  useEffect(() => {
    const commandId = draft?.imageSubmission?.commandId;
    if (!commandId || !runtime.service) return;
    let current = true;
    // 回执查找只读、绑定 target/CID；历史分页淘汰与换连接都不能触发新执行。
    void runtime.service.timeline(sessionId, undefined, undefined, undefined, commandId).then(
      (result) => {
        if (current && result.admission?.commandId === commandId)
          studioAgentStore.getState().acknowledgeImages(sessionId, commandId);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [draft?.imageSubmission?.commandId, runtime.service, sessionId]);
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
      studioAgentStore.getState().setDraftImages(sessionId, kernelId, [...unique.values()]);
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
          zh
            ? "原提交尚未确认；请连接原 Host 检查运行记录。不要重复发送。"
            : "Submission unconfirmed. Reconnect the original Host and inspect its run history before sending again.",
        );
      const result = await runtime.executePrepared(pendingImage.command);
      if (result.imageRejection) {
        studioAgentStore.getState().rejectImages(sessionId, pendingImage.command.commandId);
        throw new Error(result.imageRejection);
      }
      studioAgentStore.getState().acknowledgeImages(sessionId, pendingImage.command.commandId);
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
    }
  };
  const command = async (input: ChatSubmissionCommand) => {
    if (input.type !== "send" || !input.attachments?.length) return runtime.command(input);
    const command = runtime.prepareCommand({
      ...input,
      imageModel: requireStudioImageModel(modelOptions.options, input.selection?.model),
      kernelConfig: { ...(config ?? { executablePath: "", permission: "ask" as const }) },
    });
    studioAgentStore.getState().sealImageSubmission(sessionId, runtime.service!, command);
    const result = await runtime.executePrepared(command);
    if (result.imageRejection) {
      studioAgentStore.getState().rejectImages(sessionId, command.commandId);
      throw new Error(result.imageRejection);
    }
    studioAgentStore.getState().acknowledgeImages(sessionId, command.commandId);
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
          {zh
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
