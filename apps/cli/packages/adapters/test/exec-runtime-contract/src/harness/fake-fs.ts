// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { EventEmitter } from "node:events";

interface FileEntry {
  bytes: Buffer;
  directory: boolean;
  mode: number;
  mtimeMs: number;
}

interface WriteStreamRecord {
  path: string;
  stream: FakeWriteStream;
}

function key(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/u, "");
  return normalized.length === 0 ? "/" : normalized;
}

export class FakeFileHandle {
  closed = false;
  readonly fd: number;

  constructor(
    private readonly fileSystem: FakeFileSystem,
    readonly path: string,
    fd: number,
  ) {
    this.fd = fd;
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ buffer: Buffer; bytesRead: number }> {
    const source = this.fileSystem.readBuffer(this.path);
    const slice = source.subarray(position, position + length);
    slice.copy(buffer, offset);
    return { buffer, bytesRead: slice.length };
  }

  async stat(): Promise<ReturnType<FakeFileSystem["statSync"]>> {
    return this.fileSystem.statSync(this.path);
  }

  async truncate(length = 0): Promise<void> {
    this.fileSystem.truncateSync(this.path, length);
  }

  async writeFile(value: string | Uint8Array): Promise<void> {
    this.fileSystem.writeFileSync(this.path, value);
  }
}

export class FakeWriteStream extends EventEmitter {
  closed = false;
  destroyed = false;
  writableEnded = false;
  private blocked = false;

  constructor(
    private readonly fileSystem: FakeFileSystem,
    readonly path: string,
  ) {
    super();
  }

  write(value: string | Uint8Array): boolean {
    const error = this.fileSystem.consumeFailure("write-stream");
    if (error !== undefined) {
      queueMicrotask(() => this.emit("error", error));
      return false;
    }
    this.fileSystem.appendFileSync(this.path, value);
    if (this.fileSystem.consumeBackpressure()) {
      this.blocked = true;
      return false;
    }
    return true;
  }

  end(callback?: () => void): this {
    this.writableEnded = true;
    queueMicrotask(() => {
      callback?.();
      this.emit("finish");
      this.closed = true;
      this.emit("close");
    });
    return this;
  }

  destroy(error?: Error): this {
    this.destroyed = true;
    if (error !== undefined) {
      this.emit("error", error);
    }
    this.closed = true;
    this.emit("close");
    return this;
  }

  releaseDrain(): void {
    if (this.blocked) {
      this.blocked = false;
      this.emit("drain");
    }
  }
}

export class FakeFileSystem {
  readonly calls: Array<{ operation: string; path: string }> = [];
  readonly writeStreams: WriteStreamRecord[] = [];
  readonly files = new Map<string, FileEntry>();
  nextWriteBackpressure = false;
  private nextFileDescriptor = 100;
  private readonly failures = new Map<string, Error[]>();

  constructor() {
    this.mkdirSync("/");
    this.mkdirSync("/virtual");
    this.mkdirSync("/virtual/tmp");
    this.mkdirSync("/virtual/output");
  }

  failNext(operation: string, error: Error): void {
    const entries = this.failures.get(operation) ?? [];
    entries.push(error);
    this.failures.set(operation, entries);
  }

  consumeFailure(operation: string): Error | undefined {
    const entries = this.failures.get(operation);
    return entries?.shift();
  }

  consumeBackpressure(): boolean {
    const result = this.nextWriteBackpressure;
    this.nextWriteBackpressure = false;
    return result;
  }

  existsSync(path: string): boolean {
    this.record("existsSync", path);
    return this.files.has(key(path));
  }

  accessSync(path: string): void {
    this.record("accessSync", path);
    this.require(path);
  }

  chmodSync(path: string, mode: number): void {
    this.record("chmodSync", path);
    this.require(path).mode = mode;
  }

  mkdirSync(path: string): void {
    this.files.set(key(path), { bytes: Buffer.alloc(0), directory: true, mode: 0o700, mtimeMs: 0 });
  }

  writeFileSync(path: string, value: string | Uint8Array): void {
    this.record("writeFileSync", path);
    this.files.set(key(path), {
      bytes: Buffer.from(value),
      directory: false,
      mode: 0o600,
      mtimeMs: Date.now(),
    });
  }

  appendFileSync(path: string, value: string | Uint8Array): void {
    this.record("appendFileSync", path);
    const current = this.files.get(key(path));
    const prefix = current?.bytes ?? Buffer.alloc(0);
    this.writeFileSync(path, Buffer.concat([prefix, Buffer.from(value)]));
  }

  readFileSync(path: string): Buffer;
  readFileSync(path: string, encoding: BufferEncoding): string;
  readFileSync(path: string, options: { encoding?: BufferEncoding | null } | null): Buffer | string;
  readFileSync(
    path: string,
    options?: BufferEncoding | { encoding?: BufferEncoding | null } | null,
  ): Buffer | string {
    this.record("readFileSync", path);
    const value = Buffer.from(this.require(path).bytes);
    const encoding = typeof options === "string" ? options : options?.encoding;
    return typeof encoding === "string" ? value.toString(encoding) : value;
  }

  unlinkSync(path: string): void {
    this.record("unlinkSync", path);
    if (!this.files.delete(key(path))) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    }
  }

  truncateSync(path: string, length = 0): void {
    const entry = this.require(path);
    entry.bytes = entry.bytes.subarray(0, length);
  }

  statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
    mode: number;
    mtime: Date;
    mtimeMs: number;
    size: number;
  } {
    this.record("statSync", path);
    const entry = this.require(path);
    return {
      isDirectory: () => entry.directory,
      isFile: () => !entry.directory,
      isSymbolicLink: () => false,
      mode: entry.mode,
      mtime: new Date(entry.mtimeMs),
      mtimeMs: entry.mtimeMs,
      size: entry.bytes.length,
    };
  }

  realpathSync(path: string): string {
    this.require(path);
    return key(path);
  }

  createWriteStream(path: string): FakeWriteStream {
    this.record("createWriteStream", path);
    if (!this.files.has(key(path))) {
      this.writeFileSync(path, Buffer.alloc(0));
    }
    const stream = new FakeWriteStream(this, key(path));
    this.writeStreams.push({ path: key(path), stream });
    return stream;
  }

  createReadStream(path: string): EventEmitter {
    const stream = new EventEmitter();
    queueMicrotask(() => {
      stream.emit("data", this.readBuffer(path));
      stream.emit("end");
      stream.emit("close");
    });
    return stream;
  }

  openSync(path: string, flags: string | number): number {
    const textFlags = String(flags);
    if (!this.files.has(key(path)) || textFlags.includes("w")) {
      this.writeFileSync(path, Buffer.alloc(0));
    }
    const descriptor = this.nextFileDescriptor;
    this.nextFileDescriptor += 1;
    return descriptor;
  }

  async access(path: string): Promise<void> {
    this.accessSync(path);
  }

  async mkdir(path: string): Promise<void> {
    this.record("mkdir", path);
    this.mkdirSync(path);
  }

  async lstat(path: string): Promise<ReturnType<FakeFileSystem["statSync"]>> {
    const failure = this.consumeFailure("lstat");
    if (failure !== undefined) {
      throw failure;
    }
    this.record("lstat", path);
    const entry = this.require(path);
    return {
      isDirectory: () => entry.directory,
      isFile: () => !entry.directory,
      isSymbolicLink: () => false,
      mode: entry.mode,
      mtime: new Date(entry.mtimeMs),
      mtimeMs: entry.mtimeMs,
      size: entry.bytes.length,
    };
  }

  async open(path: string, flags: string | number): Promise<FakeFileHandle> {
    this.record("open", path);
    const failure = this.consumeFailure("open");
    if (failure !== undefined) {
      throw failure;
    }
    const textFlags = String(flags);
    if (textFlags.includes("x") && this.files.has(key(path))) {
      throw Object.assign(new Error(`EEXIST: ${path}`), { code: "EEXIST" });
    }
    if (!this.files.has(key(path)) || textFlags.includes("w")) {
      this.writeFileSync(path, Buffer.alloc(0));
    }
    const descriptor = this.nextFileDescriptor;
    this.nextFileDescriptor += 1;
    return new FakeFileHandle(this, key(path), descriptor);
  }

  async readFile(path: string, encoding?: BufferEncoding): Promise<Buffer | string> {
    const value = this.readFileSync(path);
    return encoding === undefined ? value : value.toString(encoding);
  }

  async writeFile(path: string, value: string | Uint8Array): Promise<void> {
    this.writeFileSync(path, value);
  }

  async appendFile(path: string, value: string | Uint8Array): Promise<void> {
    this.appendFileSync(path, value);
  }

  async unlink(path: string): Promise<void> {
    this.unlinkSync(path);
  }

  async rm(path: string): Promise<void> {
    if (this.files.has(key(path))) {
      this.files.delete(key(path));
    }
  }

  async stat(path: string): Promise<ReturnType<FakeFileSystem["statSync"]>> {
    const failure = this.consumeFailure("stat");
    if (failure !== undefined) {
      throw failure;
    }
    return this.statSync(path);
  }

  async statfs(): Promise<{ bavail: number; bsize: number; ffree: number }> {
    return { bavail: 10_000, bsize: 4_096, ffree: 10_000 };
  }

  async realpath(path: string): Promise<string> {
    return this.realpathSync(path);
  }

  async readdir(path: string): Promise<string[]> {
    const prefix = `${key(path)}/`;
    return [...this.files.keys()]
      .filter((candidate) => candidate.startsWith(prefix))
      .map((candidate) => candidate.slice(prefix.length).split("/")[0])
      .filter((candidate): candidate is string => candidate !== undefined && candidate.length > 0);
  }

  async truncate(path: string, length = 0): Promise<void> {
    this.truncateSync(path, length);
  }

  readBuffer(path: string): Buffer {
    return Buffer.from(this.require(path).bytes);
  }

  text(path: string): string {
    return this.readBuffer(path).toString("utf8");
  }

  paths(): string[] {
    return [...this.files.keys()];
  }

  releaseAllDrains(): void {
    for (const { stream } of this.writeStreams) {
      stream.releaseDrain();
    }
  }

  private record(operation: string, path: string): void {
    this.calls.push({ operation, path: key(path) });
  }

  private require(path: string): FileEntry {
    const entry = this.files.get(key(path));
    if (entry === undefined) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    }
    return entry;
  }
}
