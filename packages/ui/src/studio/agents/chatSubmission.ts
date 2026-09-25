import type {
  StudioChatSelection,
  StudioCommand,
  StudioKernelId,
  StudioKernelStatus,
  StudioPermission,
} from "@knorvia/services";
import { copyStudioChatSelection } from "./chatSelections.js";
import { StudioSendRefusalError, studioSendRefusal } from "./kernelSendGate.js";

type ChatSubmissionCommand =
  | Omit<Extract<StudioCommand, { type: "create-conversation" }>, "commandId">
  | Omit<Extract<StudioCommand, { type: "send" }>, "commandId">;

export interface StudioChatSubmission {
  sessionId: string;
  kernel: StudioKernelId;
  workspacePath: string;
  text: string;
  selection: StudioChatSelection;
  /** 本会话将要使用的权限档；校验只拒绝，从不改写或放宽它。 */
  permission: StudioPermission;
  /** 当前内核的发现结果（含分层探测）；缺失即视为未核验，拒绝发送。 */
  status?: StudioKernelStatus;
  /** 用于可解释文案的内核显示名。 */
  kernelName: string;
}

/**
 * Snapshot model and reasoning before conversation creation or any other asynchronous work.
 *
 * 发送前先做真实能力校验：不满足时抛 `StudioSendRefusalError` 并且**不发出任何命令**，
 * 也绝不替换模型或提升权限（见 specs/knorvia-kernel-status.md 的「发送前校验」）。
 */
export async function submitStudioChat(
  input: StudioChatSubmission,
  command: (input: ChatSubmissionCommand) => Promise<unknown>,
) {
  const refusal = studioSendRefusal({
    status: input.status,
    permission: input.permission,
    kernelName: input.kernelName,
  });
  if (refusal) throw new StudioSendRefusalError(refusal);
  const { sessionId, kernel, workspacePath, text } = input;
  const selection = copyStudioChatSelection(input.selection);
  await command({ type: "create-conversation", id: sessionId, kernel, workspacePath });
  await command({ type: "send", kind: "chat", targetId: sessionId, text, selection });
}
