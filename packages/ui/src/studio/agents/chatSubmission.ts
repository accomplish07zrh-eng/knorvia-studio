import type { StudioChatSelection, StudioCommand, StudioKernelId } from "@knorvia/services";
import { copyStudioChatSelection } from "./chatSelections.js";

type ChatSubmissionCommand =
  | Omit<Extract<StudioCommand, { type: "create-conversation" }>, "commandId">
  | Omit<Extract<StudioCommand, { type: "send" }>, "commandId">;

/** Snapshot model and reasoning before conversation creation or any other asynchronous work. */
export async function submitStudioChat(
  input: {
    sessionId: string;
    kernel: StudioKernelId;
    workspacePath: string;
    text: string;
    selection: StudioChatSelection;
  },
  command: (input: ChatSubmissionCommand) => Promise<unknown>,
) {
  const { sessionId, kernel, workspacePath, text } = input;
  const selection = copyStudioChatSelection(input.selection);
  await command({ type: "create-conversation", id: sessionId, kernel, workspacePath });
  await command({ type: "send", kind: "chat", targetId: sessionId, text, selection });
}
