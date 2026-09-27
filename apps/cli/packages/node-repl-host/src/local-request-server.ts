// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFrame } from "./json-line.js";

const MAX_REQUEST_BYTES = 1024 * 1024;
const FRAME_DEADLINE_MS = 120_000;

interface LocalRequestHandler {
  exchange(value: unknown, signal: AbortSignal): Promise<string>;
  failure(error: unknown): string;
  onError?(error: Error): void;
  platform?: NodeJS.Platform | string;
}

/** Owns transport resources only; dispatch and runtime lifetime belong to its caller. */
export class LocalRequestServer {
  readonly socketPath: string;
  readonly ready: Promise<void>;
  readonly #handler: LocalRequestHandler;
  readonly #windows: boolean;
  readonly #peers = new Map<Socket, AbortController>();
  readonly #server = createServer((socket) => this.#accept(socket));
  #bound = false;
  #stopping = false;
  #closed?: Promise<void>;

  constructor(handler: LocalRequestHandler) {
    this.#handler = handler;
    this.#windows = (handler.platform ?? process.platform) === "win32";
    const suffix = randomUUID();
    this.socketPath = this.#windows
      ? `\\\\.\\pipe\\knorvia-repl-${suffix}`
      : join(tmpdir(), `knorvia-${suffix}.sock`);
    this.#server.on("error", (error) => handler.onError?.(error));
    this.ready = new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => {
        this.#server.off("listening", listening);
        reject(error);
      };
      const listening = () => {
        this.#bound = true;
        this.#server.off("error", failed);
        resolve();
      };
      this.#server.once("error", failed);
      this.#server.once("listening", listening);
      this.#server.listen(this.socketPath).unref();
    });
  }

  #accept(socket: Socket): void {
    if (this.#stopping) {
      socket.destroy();
      return;
    }
    const lifetime = new AbortController();
    this.#peers.set(socket, lifetime);
    socket.on("error", () => lifetime.abort());
    socket.once("close", () => {
      this.#peers.delete(socket);
      lifetime.abort();
    });
    // Event callbacks do not own a promise consumer; contain even a failed error response.
    void this.#answer(socket, lifetime.signal).catch(() => socket.destroy());
  }

  async #answer(socket: Socket, signal: AbortSignal): Promise<void> {
    let line: string;
    try {
      const raw = await readFrame(
        socket,
        MAX_REQUEST_BYTES,
        AbortSignal.any([signal, AbortSignal.timeout(FRAME_DEADLINE_MS)]),
      );
      signal.throwIfAborted();
      line = await this.#handler.exchange(raw, signal);
    } catch (error) {
      line = this.#handler.failure(error);
    }
    if (!signal.aborted && socket.writable) socket.end(line);
  }

  close(): Promise<void> {
    this.#stopping = true;
    return (this.#closed ??= this.#release());
  }

  async #release(): Promise<void> {
    await this.ready.catch(() => {});
    const stopped = this.#server.listening
      ? new Promise<void>((resolve, reject) => {
          this.#server.close((error) => (error ? reject(error) : resolve()));
        })
      : Promise.resolve();
    for (const [socket, lifetime] of this.#peers) {
      lifetime.abort();
      socket.destroy();
    }
    await stopped;
    if (this.#bound && !this.#windows) await rm(this.socketPath, { force: true });
  }
}
