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

export function buildMemoryExtractionPrompt(input: {
  manifest: readonly MemoryManifestEntry[];
  messageCount: number;
}): string {
  const existingFiles =
    input.manifest.length > 0
      ? `\n\n## Existing memory files\n\n${formatMemoryManifest(input.manifest)}\n\nCheck this list before writing — update an existing file rather than creating a duplicate.`
      : "";
  return [
    `You are now acting as the memory extraction subagent. Analyze the most recent ~${input.messageCount} messages above and use them to update your persistent memory systems.`,
    "",
    "Available tools: Read, Grep, Glob, read-only Bash (ls/find/cat/stat/wc/head/tail and similar), and Edit/Write for paths inside the memory directory only, and Bash rm with paths inside the memory directory only. All other tools — MCP, Agent, write-capable Bash, etc — will be denied.",
    "",
    "You have a limited turn budget. Edit requires a prior Read of the same file, so the efficient strategy is: turn 1 — issue all Read calls in parallel for every file you might update; turn 2 — issue all Write/Edit calls in parallel. Do not interleave reads and writes across multiple turns.",
    "",
    `You MUST only use content from the last ~${input.messageCount} messages to update your persistent memories. Do not waste any turns attempting to investigate or verify that content further — no grepping source files, no reading code to confirm a pattern exists, no git commands.${existingFiles}`,
    "",
    "If nothing is worth saving, output only 'Nothing to save.' Do not explain why.",
    "",
    "If the user explicitly asks you to remember something, save it immediately as whichever type fits best. If they ask you to forget something, find and remove the relevant entry.",
    "",
    "Apply the memory types, what-not-to-save criteria, and frontmatter format from the Memory section of your system prompt — it is already in your context above.",
  ].join("\n");
}

type Acquisition<T> = Promise<{ snapshot: T } | undefined>;

export function createMemoryExtractionScheduler<
  TSnapshot extends MemoryExtractionSnapshot = MemoryExtractionSnapshot,
>(
  execute: (
    input: Omit<MemoryExtractionExecutionInput, "snapshot"> & { snapshot: TSnapshot },
  ) => Promise<MemoryExtractionExecutionStatus>,
): MemoryExtractionScheduler<TSnapshot> {
  const controller = new AbortController();
  let cursor: MessageId | undefined;
  let stopped = false;
  let busy = false;
  let accepted = 0;
  let pending: Acquisition<TSnapshot> | undefined;
  let completion: Promise<void> | undefined;

  function acquire(snapshot: TSnapshot | Promise<TSnapshot>): Acquisition<TSnapshot> {
    try {
      return Promise.resolve(snapshot).then(
        (value) => ({ snapshot: value }),
        () => undefined,
      );
    } catch {
      return Promise.resolve(undefined);
    }
  }

  function waitForSnapshot(ticket: Acquisition<TSnapshot>): Acquisition<TSnapshot> {
    const signal = controller.signal;
    if (signal.aborted) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      let finished = false;
      const finish = (value: { snapshot: TSnapshot } | undefined) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      };
      const onAbort = () => finish(undefined);
      signal.addEventListener("abort", onAbort, { once: true });
      ticket.then(finish, () => finish(undefined));
      if (signal.aborted) onAbort();
    });
  }

  async function process(ticket: Acquisition<TSnapshot>): Promise<void> {
    const acquired = await waitForSnapshot(ticket);
    if (!acquired || stopped) return;
    const snapshot = acquired.snapshot;
    const messages = snapshot.durableMessages;
    const previous = cursor;
    const located = previous ? messages.findIndex((message) => message.info.id === previous) : -1;
    const proseStart = previous && located >= 0 ? located + 1 : 0;
    const messageCount = messages.length - proseStart;
    const writeStart = previous && located < 0 ? messages.length : proseStart;
    let directWrite = false;

    for (let i = writeStart; i < messages.length && !directWrite; i += 1) {
      const message = messages[i];
      if (message.info.role !== "assistant") continue;
      for (const part of message.parts) {
        if (part.type !== "tool") continue;
        const tool: ToolPart = part;
        if (tool.tool !== "Write" && tool.tool !== "Edit") continue;
        const filePath = tool.state.input.file_path;
        if (typeof filePath !== "string" || filePath.length === 0) continue;
        if (
          resolveContainedMemoryFilePath({
            filePath,
            rootDir: snapshot.memoryRoot,
            workingDirectory: snapshot.workingDirectory,
            workspaceRoot: snapshot.workspaceRoot,
          })
        ) {
          directWrite = true;
          break;
        }
      }
    }

    let eligible = false;
    if (!directWrite) {
      for (let i = proseStart; i < messages.length && !eligible; i += 1) {
        const message = messages[i];
        if (
          message.info.role !== "user" ||
          message.info.synthetic === true ||
          message.info.visibility === "model-only"
        )
          continue;
        for (const part of message.parts) {
          if (part.type !== "text" || part.ignored === true || part.synthetic === true) continue;
          if (part.text.split(/\s+/u).filter((word) => word.length > 0).length >= 3) {
            eligible = true;
            break;
          }
        }
      }
    }

    const boundary = snapshot.boundaryMessageId;
    if (stopped) return;
    if (directWrite || !eligible) {
      if (boundary) cursor = boundary;
      return;
    }
    const status = await execute({
      abortSignal: controller.signal,
      messageCount,
      snapshot,
    });
    if (!stopped && boundary && (status === "success" || status === "no-op")) {
      cursor = boundary;
    }
  }

  async function run(first: Acquisition<TSnapshot>, release: () => void): Promise<void> {
    let ticket: Acquisition<TSnapshot> | undefined = first;
    try {
      while (ticket && !stopped) {
        try {
          await process(ticket);
        } catch {
          // Failures belong to this operation; later accepted snapshots still run.
        }
        ticket = stopped ? undefined : pending;
        pending = undefined;
      }
    } finally {
      busy = false;
      completion = undefined;
      release();
    }
  }

  return {
    drain() {
      return completion ?? Promise.resolve();
    },
    getCursor() {
      return cursor;
    },
    hasPendingWork() {
      return busy || pending !== undefined;
    },
    schedule(snapshot) {
      if (stopped) return;
      const order = ++accepted;
      if (busy) {
        const ticket = acquire(snapshot);
        if (!stopped && order === accepted) pending = ticket;
        return;
      }
      busy = true;
      let release!: () => void;
      completion = new Promise<void>((resolve) => {
        release = resolve;
      });
      const first = acquire(snapshot);
      void run(first, release);
    },
    shutdown() {
      if (stopped) return;
      stopped = true;
      pending = undefined;
      controller.abort();
    },
  };
}
