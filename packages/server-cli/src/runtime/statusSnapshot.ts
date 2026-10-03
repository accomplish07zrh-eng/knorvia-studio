import { readFile, rename, writeFile } from "node:fs/promises";
import { serverStatusSchema, type ServerStatus } from "../contracts.js";
import { resolveServerLayout, type ServerLayout } from "./paths.js";

type PersistedStatusRead =
  | { state: "valid"; status: ServerStatus }
  | { state: "missing"; status: null }
  | { state: "invalid" | "unreadable"; status: null; error: unknown };

export async function readPersistedStatusDetailed(
  layout: ServerLayout,
): Promise<PersistedStatusRead> {
  let failurePhase: "unreadable" | "invalid" = "unreadable";
  try {
    const encoded = await readFile(layout.statusFile, "utf8");
    failurePhase = "invalid";
    const status = serverStatusSchema.parse(JSON.parse(encoded));
    return { state: "valid", status };
  } catch (error) {
    // ENOENT 只有在读取阶段才表示离线；解析器抛出同形错误仍是损坏的观测。
    if (
      failurePhase === "unreadable" &&
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { state: "missing", status: null };
    }
    return { state: failurePhase, status: null, error };
  }
}

export async function readPersistedStatus(
  layout = resolveServerLayout(),
): Promise<ServerStatus | null> {
  const observation = await readPersistedStatusDetailed(layout);
  return observation.status;
}

class SnapshotSequence<T> {
  private tail: Promise<void> = Promise.resolve();

  public constructor(
    private readonly destination: string,
    private readonly getStatus: () => T,
    private readonly onError: (error: unknown) => void,
  ) {}

  public enqueue(): Promise<void> {
    // 原生 Promise 链决定失败恢复：onError 自身失败时，后继发布也不能越过该失败。
    this.tail = this.tail.then(() => this.publish()).catch(this.onError);
    return this.tail;
  }

  private async publish(): Promise<void> {
    const temporary = `${this.destination}.${process.pid}.tmp`;
    const getStatus = this.getStatus;
    const content = `${JSON.stringify(getStatus(), null, 2)}\n`;
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.destination);
  }
}

export function createStatusPersister<T>(
  statusFile: string,
  getStatus: () => T,
  onError: (error: unknown) => void,
): () => Promise<void> {
  const sequence = new SnapshotSequence(statusFile, getStatus, onError);
  return async () => {
    await sequence.enqueue();
  };
}
