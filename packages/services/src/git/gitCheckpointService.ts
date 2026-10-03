import { randomUUID } from "node:crypto";
import type { GitCheckpointMeta } from "@knorvia/shared";
import type { IGitCheckpointService } from "./gitCheckpoint.js";
import { createGitCheckpointRepo, type GitCheckpointRepo } from "./repo/gitCheckpointRepo.js";
import { GitCheckpointStore } from "./repo/gitCheckpointStore.js";

export function createGitCheckpointService(options?: {
  store?: GitCheckpointStore;
  repo?: GitCheckpointRepo;
}): IGitCheckpointService {
  const store = options?.store ?? new GitCheckpointStore();
  const repo = options?.repo ?? createGitCheckpointRepo();

  async function loadCheckpoint(workspacePath: string, checkpointId: string) {
    const checkpoint = await store.load(workspacePath, checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint does not exist: ${checkpointId}`);
    }
    if (checkpoint.workspacePath !== workspacePath) {
      throw new Error(`Checkpoint workspace mismatch: ${checkpoint.checkpointId}`);
    }
    return checkpoint;
  }

  function validatePair(from: GitCheckpointMeta, to: GitCheckpointMeta): void {
    if (from.repoRoot !== to.repoRoot) {
      throw new Error("Checkpoint repoRoot mismatch.");
    }
    if (from.scope !== to.scope) {
      throw new Error("Checkpoint scope mismatch.");
    }
    if (from.workspaceInRepoPath !== to.workspaceInRepoPath) {
      throw new Error("Checkpoint workspace scope mismatch.");
    }
  }

  return {
    async createCheckpoint(params) {
      const checkpointId = randomUUID();
      const checkpoint = await repo.createCheckpoint({
        workspacePath: params.workspacePath,
        checkpointId,
      });
      await store.save(checkpoint);
      return checkpoint;
    },

    async diffCheckpoints(params) {
      const [from, to] = await Promise.all([
        loadCheckpoint(params.workspacePath, params.fromCheckpointId),
        loadCheckpoint(params.workspacePath, params.toCheckpointId),
      ]);
      validatePair(from, to);
      return await repo.diffCheckpoints({
        workspacePath: params.workspacePath,
        from,
        to,
      });
    },

    async restoreBetweenCheckpoints(params) {
      const [from, to] = await Promise.all([
        loadCheckpoint(params.workspacePath, params.fromCheckpointId),
        loadCheckpoint(params.workspacePath, params.toCheckpointId),
      ]);
      validatePair(from, to);
      return await repo.restoreBetweenCheckpoints({
        workspacePath: params.workspacePath,
        from,
        to,
        force: params.force,
      });
    },

    async deleteCheckpoint(params) {
      const checkpoint = await loadCheckpoint(params.workspacePath, params.checkpointId);
      await repo.deleteCheckpoint({ workspacePath: params.workspacePath, checkpoint });
      await store.delete(params.workspacePath, params.checkpointId);
    },
  };
}
