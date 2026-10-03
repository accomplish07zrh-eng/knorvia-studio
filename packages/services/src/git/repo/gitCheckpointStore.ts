import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitCheckpointMeta } from "@knorvia/shared";
import { getAppConfigDir, getWorkspaceHash } from "../../paths.js";

export class GitCheckpointStore {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly options?: { rootDir?: string }) {}

  async save(meta: GitCheckpointMeta): Promise<void> {
    const target = this.checkpointPath(meta.workspacePath, meta.checkpointId);
    await this.enqueue(target, async () => {
      await mkdir(this.workspaceDirectory(meta.workspacePath), { recursive: true });
      await this.writeAtomic(target, meta);
    });
  }

  async load(workspacePath: string, checkpointId: string): Promise<GitCheckpointMeta | null> {
    const target = this.checkpointPath(workspacePath, checkpointId);
    try {
      await this.waitForPendingWrite(target);
      const parsed: unknown = JSON.parse(await readFile(target, "utf-8"));
      return this.isCheckpointMeta(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async delete(workspacePath: string, checkpointId: string): Promise<void> {
    const target = this.checkpointPath(workspacePath, checkpointId);
    await this.enqueue(target, async () => {
      await rm(target, { force: true });
    });
  }

  private workspaceDirectory(workspacePath: string): string {
    const root = this.options?.rootDir ?? join(getAppConfigDir(), "checkpoints");
    return join(root, getWorkspaceHash(workspacePath));
  }

  private checkpointPath(workspacePath: string, checkpointId: string): string {
    return join(this.workspaceDirectory(workspacePath), `${checkpointId}.json`);
  }

  private async waitForPendingWrite(target: string): Promise<void> {
    const pending = this.pending.get(target);
    await pending?.catch(() => undefined);
  }

  private enqueue(target: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.pending.get(target) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const completion = result.then(
      () => undefined,
      () => undefined,
    );
    this.pending.set(target, completion);
    void completion.finally(() => {
      if (this.pending.get(target) === completion) {
        this.pending.delete(target);
      }
    });
    return result;
  }

  private async writeAtomic(target: string, meta: GitCheckpointMeta): Promise<void> {
    const temporary = `${target}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    await writeFile(temporary, JSON.stringify(meta, null, 2) + "\n", "utf-8");
    await rename(temporary, target);
  }

  private isCheckpointMeta(value: unknown): value is GitCheckpointMeta {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const fields = value as Record<string, unknown>;
    return (
      typeof fields.checkpointId === "string" &&
      typeof fields.workspacePath === "string" &&
      typeof fields.repoRoot === "string" &&
      typeof fields.workspaceInRepoPath === "string" &&
      typeof fields.createdAt === "number" &&
      typeof fields.refName === "string" &&
      typeof fields.commitOid === "string" &&
      fields.scope === "workspace"
    );
  }
}
