// SPDX-License-Identifier: Apache-2.0
// 记忆提取：构造提取子代理的提示词，并把「什么时候值得跑一次提取」做成可排队的调度器。
// 调度器只做三件事：串行执行、丢弃过期快照、按游标推进；真正的读写由注入的 execute 承担。
import type { MessageId, MessageWithParts, ToolPart } from "@knorvia/contracts";
import { resolveContainedMemoryFilePath } from "./memory-file-path.js";
import { formatMemoryManifest } from "./recall/manifest.js";
import type { MemoryManifestEntry } from "./recall/types.js";

type MemoryExtractionExecutionStatus = "success" | "no-op" | "error" | "aborted";

export interface MemoryExtractionSnapshot {
  boundaryMessageId: MessageId;
  durableMessages: readonly MessageWithParts[];
  memoryRoot: string;
  workingDirectory: string;
  workspaceRoot: string;
}

interface MemoryExtractionExecutionInput {
  abortSignal: AbortSignal;
  messageCount: number;
  snapshot: MemoryExtractionSnapshot;
}

export interface MemoryExtractionScheduler<
  TSnapshot extends MemoryExtractionSnapshot = MemoryExtractionSnapshot,
> {
  drain(): Promise<void>;
  getCursor(): MessageId | undefined;
  hasPendingWork(): boolean;
  schedule(snapshot: TSnapshot | Promise<TSnapshot>): void;
  shutdown(): void;
}

// 提示词里的空行与「没有既有文件」两种情况各给一个具名常量，正文只留真正会变的内容。
const PROMPT_BLANK_LINE = "";
const NO_EXISTING_FILES = "";
// 一段用户 prose 至少要有这么多词才值得提取，避免「好的」「继续」这类噪声触发一次运行。
const MIN_ELIGIBLE_WORDS = 3;

// 既有记忆文件清单：有清单时附上「先看清单、改而不是新建」的提醒，没有就整段缺席。
function existingFilesSection(manifest: readonly MemoryManifestEntry[]): string {
  if (manifest.length === 0) return NO_EXISTING_FILES;
  const listing = formatMemoryManifest(manifest);
  return `\n\n## Existing memory files\n\n${listing}\n\nCheck this list before writing — update an existing file rather than creating a duplicate.`;
}

// 提取提示的固定行：两段之间的空行由 PROMPT_BLANK_LINE 承担。
function extractionPromptLines(messageCount: number, existingFiles: string): string[] {
  const lines = [
    `You are now acting as the memory extraction subagent. Analyze the most recent ~${messageCount} messages above and use them to update your persistent memory systems.`,
    PROMPT_BLANK_LINE,
    "Available tools: Read, Grep, Glob, read-only Bash (ls/find/cat/stat/wc/head/tail and similar), and Edit/Write for paths inside the memory directory only, and Bash rm with paths inside the memory directory only. All other tools — MCP, Agent, write-capable Bash, etc — will be denied.",
    PROMPT_BLANK_LINE,
    "You have a limited turn budget. Edit requires a prior Read of the same file, so the efficient strategy is: turn 1 — issue all Read calls in parallel for every file you might update; turn 2 — issue all Write/Edit calls in parallel. Do not interleave reads and writes across multiple turns.",
    PROMPT_BLANK_LINE,
    `You MUST only use content from the last ~${messageCount} messages to update your persistent memories. Do not waste any turns attempting to investigate or verify that content further — no grepping source files, no reading code to confirm a pattern exists, no git commands.${existingFiles}`,
    PROMPT_BLANK_LINE,
    "If nothing is worth saving, output only 'Nothing to save.' Do not explain why.",
    PROMPT_BLANK_LINE,
    "If the user explicitly asks you to remember something, save it immediately as whichever type fits best. If they ask you to forget something, find and remove the relevant entry.",
    PROMPT_BLANK_LINE,
    "Apply the memory types, what-not-to-save criteria, and frontmatter format from the Memory section of your system prompt — it is already in your context above.",
  ];
  return lines;
}

interface MemoryExtractionPromptInput {
  manifest: readonly MemoryManifestEntry[];
  messageCount: number;
}

export function buildMemoryExtractionPrompt(input: MemoryExtractionPromptInput): string {
  return extractionPromptLines(input.messageCount, existingFilesSection(input.manifest)).join("\n");
}

type Acquisition<T> = Promise<{ snapshot: T } | undefined>;

const NO_TICKET = undefined;
const NO_MATCH = false;

// 这条工具调用是不是往记忆目录里直写：Write/Edit 且目标路径落在 memoryRoot 之内。
function isDirectMemoryWrite(tool: ToolPart, snapshot: MemoryExtractionSnapshot): boolean {
  if (tool.tool !== "Write" && tool.tool !== "Edit") return false;
  const filePath = tool.state.input.file_path;
  if (typeof filePath !== "string" || filePath.length === 0) return false;
  const contained = resolveContainedMemoryFilePath({
    filePath,
    rootDir: snapshot.memoryRoot,
    workingDirectory: snapshot.workingDirectory,
    workspaceRoot: snapshot.workspaceRoot,
  });
  return contained !== undefined;
}

// 从 writeStart 起有没有任何一条直写；找到第一条就停。
function hasDirectMemoryWrite(
  messages: readonly MessageWithParts[],
  from: number,
  snapshot: MemoryExtractionSnapshot,
): boolean {
  for (let index = from; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.info.role === "assistant") {
      for (const part of message.parts) {
        if (part.type === "tool" && isDirectMemoryWrite(part as ToolPart, snapshot)) return true;
      }
    }
  }
  return NO_MATCH;
}

// 从 proseStart 起有没有值得提取的用户 prose：非合成、非 model-only、且文本至少 MIN_ELIGIBLE_WORDS 个词。
function hasEligibleProse(messages: readonly MessageWithParts[], from: number): boolean {
  for (let index = from; index < messages.length; index += 1) {
    const message = messages[index];
    const eligibleRole =
      message.info.role === "user" &&
      message.info.synthetic !== true &&
      message.info.visibility !== "model-only";
    if (eligibleRole) {
      for (const part of message.parts) {
        if (part.type !== "text" || part.ignored === true || part.synthetic === true) continue;
        const words = part.text.split(/\s+/u).filter((word) => word.length > 0).length;
        if (words >= MIN_ELIGIBLE_WORDS) return true;
      }
    }
  }
  return NO_MATCH;
}

export function createMemoryExtractionScheduler<
  TSnapshot extends MemoryExtractionSnapshot = MemoryExtractionSnapshot,
>(
  execute: (
    input: Omit<MemoryExtractionExecutionInput, "snapshot"> & { snapshot: TSnapshot },
  ) => Promise<MemoryExtractionExecutionStatus>,
): MemoryExtractionScheduler<TSnapshot> {
  const controller = new AbortController();
  let committedCursor: MessageId | undefined;
  let shutdownRequested = false;
  let draining = false;
  let acceptedCount = 0;
  let queued: Acquisition<TSnapshot> | undefined;
  let drainPromise: Promise<void> | undefined;

  // 把一个快照（或它的 Promise）包成票据；快照 Promise 失败时票据解析为 undefined。
  function toTicket(snapshot: TSnapshot | Promise<TSnapshot>): Acquisition<TSnapshot> {
    return Promise.resolve(snapshot).then(
      (value) => ({ snapshot: value }),
      () => NO_TICKET,
    );
  }

  // 等票据落地，但 shutdown 会让等待立刻结束；abort 监听只装一次、落地即摘。
  function awaitTicket(ticket: Acquisition<TSnapshot>): Acquisition<TSnapshot> {
    const signal = controller.signal;
    if (signal.aborted) return Promise.resolve(NO_TICKET);
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: { snapshot: TSnapshot } | undefined) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      };
      const onAbort = () => settle(NO_TICKET);
      signal.addEventListener("abort", onAbort, { once: true });
      void ticket.then(settle, () => settle(NO_TICKET));
      if (signal.aborted) onAbort();
    });
  }

  async function runOnce(ticket: Acquisition<TSnapshot>): Promise<void> {
    const acquired = await awaitTicket(ticket);
    if (!acquired || shutdownRequested) return;
    const snapshot = acquired.snapshot;
    const messages = snapshot.durableMessages;
    const previous = committedCursor;
    const located = previous ? messages.findIndex((message) => message.info.id === previous) : -1;
    const proseStart = previous && located >= 0 ? located + 1 : 0;
    const messageCount = messages.length - proseStart;
    const writeStart = previous && located < 0 ? messages.length : proseStart;

    const directWrite = hasDirectMemoryWrite(messages, writeStart, snapshot);
    const eligible = !directWrite && hasEligibleProse(messages, proseStart);
    const boundary = snapshot.boundaryMessageId;

    if (shutdownRequested) return;
    if (directWrite || !eligible) {
      if (boundary) committedCursor = boundary;
      return;
    }
    const status = await execute({
      abortSignal: controller.signal,
      messageCount,
      snapshot,
    });
    const advanced = status === "success" || status === "no-op";
    if (!shutdownRequested && boundary && advanced) committedCursor = boundary;
  }

  // 串行执行队列：跑完一个再看有没有新票据；finally 里一定要释放 drain 等待者。
  async function drainQueue(first: Acquisition<TSnapshot>, release: () => void): Promise<void> {
    let ticket: Acquisition<TSnapshot> | undefined = first;
    try {
      while (ticket && !shutdownRequested) {
        try {
          await runOnce(ticket);
        } catch {
          // Failures belong to this operation; later accepted snapshots still run.
        }
        ticket = shutdownRequested ? undefined : queued;
        queued = undefined;
      }
    } finally {
      draining = false;
      drainPromise = undefined;
      release();
    }
  }

  const scheduler: MemoryExtractionScheduler<TSnapshot> = {
    drain: () => drainPromise ?? Promise.resolve(),
    getCursor: () => committedCursor,
    hasPendingWork: () => draining || queued !== undefined,
    schedule(snapshot) {
      if (shutdownRequested) return;
      const order = ++acceptedCount;
      if (draining) {
        const ticket = toTicket(snapshot);
        if (!shutdownRequested && order === acceptedCount) queued = ticket;
        return;
      }
      draining = true;
      let release!: () => void;
      drainPromise = new Promise<void>((resolve) => {
        release = resolve;
      });
      const first = toTicket(snapshot);
      void drainQueue(first, release);
    },
    shutdown() {
      if (shutdownRequested) return;
      shutdownRequested = true;
      queued = undefined;
      controller.abort();
    },
  };
  return scheduler;
}
