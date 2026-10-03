import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { Emitter } from "@knorvia/rpc";
import { knorviaProtocolMessageSchema, type KnorviaProtocolMessage } from "@knorvia/shared";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import {
  captureExitedRootDescendantsSnapshotAsync,
  captureProcessGroupSnapshot,
  captureProcessTreeSnapshotAsync,
  terminateProcessTree,
  terminateProcessTreeAndWait,
  type ProcessTreeTerminatorWaitOptions,
  type ProcessTreeSnapshot,
} from "#src/process/processTreeTerminator.js";
import { AgentStderrCollector, EXIT_STDERR_DRAIN_MS } from "./agentStderrCollector.js";
import type { KnorviaProtocolTransportClosedEvent } from "./protocolTransport.js";

interface KnorviaStdioTransportOptions {
  onStderrLine?: (line: string) => void;
  ownedProcessGroupId?: number;
  ownedProcessStartedAtMs?: number;
}

const logger = createServiceLogger("agent-process-tree");

export class KnorviaStdioTransport {
  readonly kind = "stdio" as const;
  private readonly messageEmitter = new Emitter<KnorviaProtocolMessage>();
  private readonly closeEmitter = new Emitter<KnorviaProtocolTransportClosedEvent>();
  readonly onMessage = this.messageEmitter.event;
  readonly onClose = this.closeEmitter.event;
  private readonly decoder = new StringDecoder("utf8");
  private readonly stderrCollector: AgentStderrCollector;
  private buffer = "";
  private decoderEnded = false;
  private readersRemoved = false;
  private closed = false;
  private disposed = false;
  private childExitedAtMs: number | undefined;
  private cleanupPromise: Promise<void> | undefined;
  private cleanupAttempts = 0;
  private cleanupSnapshot: ProcessTreeSnapshot | undefined;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly options?: KnorviaStdioTransportOptions,
  ) {
    this.stderrCollector = new AgentStderrCollector(child.stderr, options?.onStderrLine);
    child.stdout.on("data", this.receiveData);
    child.stdout.once("end", this.finishStdout);
    child.stdout.once("close", this.finishStdout);
    child.stdin.on("error", (error: Error) => {
      this.publishClose({ reason: `stdin_error: ${error.message}` });
    });
    child.stdout.on("error", (error: Error) => {
      this.publishClose({ reason: `stdout_error: ${error.message}` });
    });
    child.once("exit", (code, signal) => {
      this.childExitedAtMs = Date.now();
      this.publishClose({ code, signal });
      this.removeStdoutReaders();
      void this.waitForStderrDrain();
    });
    child.once("error", (error: Error) => {
      this.publishClose({ reason: error.message });
      this.removeStdoutReaders();
      void this.waitForStderrDrain();
    });
  }

  async send(message: KnorviaProtocolMessage): Promise<void> {
    if (this.disposed || this.closed || this.child.killed || !this.child.stdin.writable) {
      throw new Error("Knorvia Studio agent stdio transport is closed");
    }
    const frame = JSON.stringify(message) + "\n";
    await new Promise<void>((resolve, reject) => {
      this.child.stdin.write(frame, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposeLocalResources();
    void this.stderrCollector.waitForDrain(3250);
    if (this.child.exitCode === null && this.child.signalCode === null) {
      const groupId = this.options?.ownedProcessGroupId;
      terminateProcessTree(this.child, groupId ? { ownedProcessGroupId: groupId } : {});
    }
  }

  disposeAndWait(): Promise<void> {
    if (!this.cleanupPromise) {
      const flight: Promise<void> = this.performCleanup().finally(() => {
        if (this.cleanupPromise === flight) this.cleanupPromise = undefined;
      });
      this.cleanupPromise = flight;
    }
    return this.cleanupPromise;
  }

  waitForStderrDrain(): Promise<void> {
    return this.stderrCollector.waitForDrain();
  }

  private publishClose(event: KnorviaProtocolTransportClosedEvent): void {
    if (this.closed) return;
    this.closed = true;
    this.closeEmitter.fire(event);
  }

  private readonly receiveData = (chunk: Buffer | string): void => {
    if (this.closed) return;
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    while (!this.closed) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) return;
      const frame = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      this.dispatchFrame(frame);
    }
  };

  private dispatchFrame(frame: string): void {
    if (frame.endsWith("\r")) frame = frame.slice(0, -1);
    if (!frame.trim()) return;
    try {
      const parsed: unknown = JSON.parse(frame);
      this.messageEmitter.fire(knorviaProtocolMessageSchema.parse(parsed));
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.publishClose({ reason: `protocol_parse_error: ${reason}` });
    }
  }

  private readonly finishStdout = (): void => {
    if (this.decoderEnded) return;
    this.decoderEnded = true;
    this.buffer += this.decoder.end();
    const trailingFrame = this.buffer;
    this.buffer = "";
    if (!this.closed && trailingFrame.length > 0) this.dispatchFrame(trailingFrame);
    this.publishClose({ reason: "stdout_closed" });
  };

  private removeStdoutReaders(): void {
    if (this.readersRemoved) return;
    this.readersRemoved = true;
    this.child.stdout.off("data", this.receiveData);
    this.child.stdout.off("end", this.finishStdout);
    this.child.stdout.off("close", this.finishStdout);
    this.child.stdout.resume();
  }

  private disposeLocalResources(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeStdoutReaders();
    this.messageEmitter.dispose();
    this.closeEmitter.dispose();
  }

  private childHasExited(): boolean {
    return this.child.exitCode !== null || this.child.signalCode !== null;
  }

  private unavailableSnapshot(pid: number): ProcessTreeSnapshot {
    return {
      rootPid: pid,
      descendantPids: [],
      identities: [],
      identityVerification: "unavailable",
    };
  }

  private async captureSnapshot(
    windowsDeadlineAtMs: number | undefined,
  ): Promise<ProcessTreeSnapshot | undefined> {
    const childAlreadyExited = this.childHasExited();
    const deadlineOptions =
      windowsDeadlineAtMs === undefined ? {} : { windowsCleanupDeadlineAtMs: windowsDeadlineAtMs };
    if (!childAlreadyExited) {
      const liveSnapshot = await captureProcessTreeSnapshotAsync(this.child, {
        log: logger,
        ...deadlineOptions,
        ownedProcessStartedAtMs: this.options?.ownedProcessStartedAtMs,
        resolveOwnedProcessExitedAtMs: () => this.childExitedAtMs,
      });
      if (liveSnapshot) return liveSnapshot;
    }
    if (process.platform === "win32" && !childAlreadyExited && this.child.pid) {
      return this.unavailableSnapshot(this.child.pid);
    }
    const groupId = this.options?.ownedProcessGroupId;
    if (groupId) return captureProcessGroupSnapshot(groupId);
    const exitedSnapshot = await captureExitedRootDescendantsSnapshotAsync(this.child.pid ?? 0, {
      log: logger,
      ...deadlineOptions,
      ownedProcessStartedAtMs: this.options?.ownedProcessStartedAtMs,
      ownedProcessExitedAtMs: this.childExitedAtMs ?? Date.now(),
    });
    if (exitedSnapshot) return exitedSnapshot;
    if (process.platform === "win32" && this.child.pid) {
      return this.unavailableSnapshot(this.child.pid);
    }
    return undefined;
  }

  private requestStdinEof(): void {
    if (this.child.stdin.destroyed || !this.child.stdin.writable) return;
    try {
      this.child.stdin.once("error", () => {});
      this.child.stdin.end();
    } catch {
      // EOF is a best-effort cooperative request; tree cleanup still follows.
    }
  }

  private waitForChildExit(timeoutMs: number): Promise<void> {
    if (this.childHasExited()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this.child.off?.("exit", settle);
        resolve();
      };
      this.child.once("exit", settle);
      timer = setTimeout(settle, timeoutMs);
      timer.unref?.();
    });
  }

  private async performCleanup(): Promise<void> {
    this.disposeLocalResources();
    const forceBudgetMs = this.cleanupAttempts++ === 0 ? 2000 : 0;
    const cleanupStartedAtMs = Date.now();
    const windowsDeadlineAtMs =
      process.platform === "win32" ? cleanupStartedAtMs + forceBudgetMs + 1000 + 250 : undefined;
    if (this.cleanupSnapshot == null) {
      this.cleanupSnapshot = await this.captureSnapshot(windowsDeadlineAtMs);
    }
    if (!this.childHasExited()) {
      this.requestStdinEof();
      const configuredWaitMs = process.env.KNORVIA_E2E_COVERAGE === "1" ? 5000 : 1800;
      const waitMs =
        windowsDeadlineAtMs === undefined
          ? configuredWaitMs
          : Math.min(configuredWaitMs, Math.max(windowsDeadlineAtMs - Date.now(), 0));
      await this.waitForChildExit(waitMs);
    }
    const groupId = this.options?.ownedProcessGroupId;
    const startedAtMs = this.options?.ownedProcessStartedAtMs;
    const terminationOptions: ProcessTreeTerminatorWaitOptions = {
      ...(groupId ? { ownedProcessGroupId: groupId } : {}),
      ...(startedAtMs
        ? {
            ownedProcessStartedAtMs: startedAtMs,
            ownedProcessExitedAtMs: this.childExitedAtMs ?? Date.now(),
          }
        : {}),
      ...(this.cleanupSnapshot ? { snapshot: this.cleanupSnapshot } : {}),
      log: logger,
      windowsTaskkillTimeoutMs: 1000,
      ...(windowsDeadlineAtMs === undefined
        ? {}
        : { windowsCleanupDeadlineAtMs: windowsDeadlineAtMs }),
      forceAfterMs: Math.max(forceBudgetMs - (Date.now() - cleanupStartedAtMs), 0),
    };
    const result = await terminateProcessTreeAndWait(this.child, terminationOptions);
    const remainingPids = result.remainingPids;
    const stderrDrainMs =
      windowsDeadlineAtMs === undefined
        ? undefined
        : Math.max(0, Math.min(EXIT_STDERR_DRAIN_MS, windowsDeadlineAtMs - Date.now()));
    await this.stderrCollector.waitForDrain(stderrDrainMs);
    if (remainingPids.length > 0) {
      throw new Error(
        `runtime process tree cleanup incomplete; remaining pid=${[...new Set(remainingPids)].join(",")}`,
      );
    }
  }
}
