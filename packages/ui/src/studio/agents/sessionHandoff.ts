import type {
  IStudioRuntimeService,
  StudioKernelId,
  StudioKernelStatus,
  StudioMessage,
} from "@knorvia/services";
import { redactDiagnosticText } from "@knorvia/shared";
import type { CommandAck, CommandEnvelope } from "@knorvia/shared/protocol-v4";
import { createCommandEnvelope } from "../../v4/commandFactory.js";

const HANDOFF_MESSAGE_LIMIT = 24;
const HANDOFF_EXCERPT_LIMIT = 700;
const HANDOFF_TEXT_LIMIT = 20_000;
const EXPORT_MESSAGE_LIMIT = 10_000;
const EXPORT_BYTE_LIMIT = 8 * 1024 * 1024;

function visible(message: StudioMessage): boolean {
  return message.sender !== "system" && (message.kind === "tool" || message.kind === "text");
}

function safeLine(value: string, limit: number): string {
  return redactDiagnosticText(value).replace(/\s+/g, " ").trim().slice(0, limit);
}

function toolSummary(message: StudioMessage): string {
  const name = safeLine(message.name || "tool", 120);
  const state = safeLine(message.state || "unknown", 80);
  return `${name} (${state})`;
}

/** Local extractive draft. It deliberately excludes reasoning and raw tool output. */
export function buildStudioHandoffDraft(
  messages: readonly StudioMessage[],
  sourceName: string,
  zh = true,
) {
  const recent = messages.filter(visible).slice(-HANDOFF_MESSAGE_LIMIT);
  const lines = recent
    .map((message) => {
      if (message.kind === "tool") return `- ${zh ? "工具" : "Tool"}: ${toolSummary(message)}`;
      const role = message.sender === "user" ? (zh ? "用户" : "User") : sourceName;
      return `- ${role}：${safeLine(message.text, HANDOFF_EXCERPT_LIMIT)}`;
    })
    .filter((line) => !line.endsWith("："));
  return {
    includedCount: recent.length,
    text: zh
      ? `请在此基础上继续当前项目的工作。以下是用户确认前可编辑的会话摘要（最近 ${recent.length} 条已加载记录）：\n\n${lines.join("\n")}`
      : `Continue the current project from this reviewed summary (${recent.length} recently loaded entries):\n\n${lines.join("\n")}`,
  };
}

export interface StudioHandoffAttempt {
  targetId: string;
  sourceKernel: StudioKernelId;
  targetKernel: StudioKernelId;
  workspacePath: string;
  text: string;
}

export interface NativeHandoffAttempt {
  sourceKernel: StudioKernelId;
  targetKernel: "knorvia";
  workspacePath: string;
  text: string;
  /** The same V4 create + first-input command is replayed after an uncertain ACK. */
  envelope: CommandEnvelope;
}

export function availableHandoffTargets(
  statuses: readonly StudioKernelStatus[],
  sourceKernel: StudioKernelId,
  nativeTargetAvailable: boolean,
): StudioKernelStatus[] {
  return statuses.filter(
    (status) =>
      status.installed &&
      !status.error &&
      status.id !== sourceKernel &&
      !status.id.startsWith("ssh:") &&
      (status.id !== "knorvia" || nativeTargetAvailable),
  );
}

export function createNativeHandoffAttempt(input: {
  sourceKernel: StudioKernelId;
  workspacePath: string;
  text: string;
}): NativeHandoffAttempt {
  if (input.sourceKernel === "knorvia" || input.sourceKernel.startsWith("ssh:"))
    throw new Error("请选择不同的本机内核");
  if (!input.workspacePath.trim()) throw new Error("请先选择项目");
  if (!input.text.trim() || input.text.length > HANDOFF_TEXT_LIMIT)
    throw new Error("接力摘要为空或过长");
  return {
    ...input,
    targetKernel: "knorvia",
    envelope: createCommandEnvelope({
      type: "createSession",
      sessionId: null,
      payload: {
        workspaceId: input.workspacePath,
        firstInput: { text: input.text },
      },
    }),
  };
}

/** Native V4 owns the actual session ID; Studio Runtime must never create it. */
export async function performNativeHandoff(
  sendCommand: (envelope: CommandEnvelope) => Promise<CommandAck>,
  attempt: NativeHandoffAttempt,
): Promise<string> {
  const ack = await sendCommand(attempt.envelope);
  if (ack.status !== "accepted" && ack.status !== "duplicate")
    throw new Error(ack.reasonCode ?? `原生会话未接受接力：${ack.status}`);
  if (ack.result?.type !== "createSession" || !ack.result.sessionId)
    throw new Error("原生会话未返回 sessionId");
  return ack.result.sessionId;
}

/** A cancelled file picker is a completed no-op, not an export success. */
export async function saveHandoffMarkdownWithDialog(
  saveFile: (params: { data: ArrayBuffer; suggestedName: string }) => Promise<{
    canceled?: boolean;
    success: boolean;
    error?: string;
  }>,
  bytes: Uint8Array,
  suggestedName: string,
): Promise<boolean> {
  const result = await saveFile({ data: bytes.buffer as ArrayBuffer, suggestedName });
  if (result.canceled) return false;
  if (!result.success) throw new Error(result.error || "保存失败");
  return true;
}

/** Two stable command IDs make an uncertain acknowledgement safe to retry. */
export async function performStudioHandoff(
  service: Pick<IStudioRuntimeService, "command">,
  attempt: StudioHandoffAttempt,
) {
  if (attempt.sourceKernel === attempt.targetKernel) throw new Error("请选择不同内核");
  if (
    attempt.targetKernel === "knorvia" ||
    attempt.targetKernel.startsWith("ssh:") ||
    attempt.sourceKernel.startsWith("ssh:")
  )
    throw new Error("此内核暂不能安全接力到独立本机会话");
  if (!attempt.workspacePath.trim()) throw new Error("请先选择项目");
  if (!attempt.text.trim() || attempt.text.length > HANDOFF_TEXT_LIMIT)
    throw new Error("接力摘要为空或过长");
  await service.command({
    commandId: `handoff:${attempt.targetId}:create`,
    type: "create-conversation",
    id: attempt.targetId,
    kernel: attempt.targetKernel,
    workspacePath: attempt.workspacePath,
  });
  return service.command({
    commandId: `handoff:${attempt.targetId}:send`,
    type: "send",
    kind: "chat",
    targetId: attempt.targetId,
    text: attempt.text,
  });
}

function codeBlock(value: string): string {
  const longest = Math.max(2, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${value}\n${fence}`;
}

function messageMarkdown(message: StudioMessage, kernelName: string): string {
  const when =
    Number.isFinite(message.createdAt) && Math.abs(message.createdAt) <= 8.64e15
      ? new Date(message.createdAt).toISOString()
      : "";
  if (message.kind === "tool") return `### 工具 · ${when}\n\n- ${toolSummary(message)}`;
  const role = message.sender === "user" ? "用户" : kernelName;
  return `### ${redactDiagnosticText(role)} · ${when}\n\n${codeBlock(redactDiagnosticText(message.text))}`;
}

/** Format only visible content; tool payload and reasoning never enter the output. */
export function formatHandoffMarkdown(
  messages: readonly StudioMessage[],
  title: string,
  kernelName: string,
): string {
  const ordered = messages
    .filter(visible)
    .sort(
      (a, b) =>
        (a.sequence ?? a.createdAt) - (b.sequence ?? b.createdAt) || a.id.localeCompare(b.id),
    );
  const heading = safeLine(title || "会话", 160).replace(/^#+\s*/u, "") || "会话";
  const encoder = new TextEncoder();
  const parts = [`# ${heading}\n\n`];
  let bytes = encoder.encode(parts[0]).byteLength;
  for (const message of ordered) {
    if (message.kind === "text" && message.text.length > EXPORT_BYTE_LIMIT)
      throw new Error("会话超出导出大小上限");
    const part = `${messageMarkdown(message, kernelName)}\n\n`;
    bytes += encoder.encode(part).byteLength;
    if (bytes > EXPORT_BYTE_LIMIT) throw new Error("会话超出导出大小上限");
    parts.push(part);
  }
  return parts.join("");
}

/** Fetch every persisted page; an incomplete transcript is an error, never a silent export. */
export async function exportStudioConversationMarkdown(
  service: Pick<IStudioRuntimeService, "timeline">,
  targetId: string,
  title: string,
  kernelName: string,
): Promise<string> {
  const messages = new Map<string, StudioMessage>();
  const seenBefore = new Set<number>();
  let before: number | undefined;
  let count = 0;
  for (;;) {
    const page = await service.timeline(targetId, before);
    count += page.messages.length;
    if (count > EXPORT_MESSAGE_LIMIT) throw new Error("会话超出导出条数上限");
    for (const message of page.messages)
      if (!messages.has(message.id)) messages.set(message.id, message);
    if (page.nextBefore === undefined) break;
    if (!Number.isSafeInteger(page.nextBefore) || seenBefore.has(page.nextBefore))
      throw new Error("会话历史分页无法继续，未导出不完整内容");
    seenBefore.add(page.nextBefore);
    before = page.nextBefore;
  }
  return formatHandoffMarkdown([...messages.values()], title, kernelName);
}

export function studioExportFileName(title: string): string {
  const base = title
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\p{Cc}/gu, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return `${base || "conversation"}.md`;
}
