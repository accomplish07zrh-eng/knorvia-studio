import { Emitter } from "@knorvia/rpc";
import type { StorageCleanRequest, StorageRootId, StorageUsageSnapshot } from "@knorvia/shared";
import type { IStorageService } from "../contract.js";
import { planStorageClean } from "../domain/cleanPlan.js";
import { getStorageCategoryCleanability, getStorageCleanScopes } from "../domain/storageCatalog.js";
import type { FsCleanerPort, RootsResolverPort, ScanRunnerPort } from "./ports.js";
import { createScanJob, type ScanJob } from "./scanJob.js";

interface StorageServiceDependencies {
  roots: RootsResolverPort;
  scanRunner: ScanRunnerPort;
  cleaner: FsCleanerPort;
  now?: () => number;
  progressThrottleMs?: number;
}

export function createStorageService(deps: StorageServiceDependencies): IStorageService {
  const now = deps.now ?? Date.now;
  const throttleMs = deps.progressThrottleMs ?? 300;
  const emitter = new Emitter<StorageUsageSnapshot>();
  let currentJob: ScanJob | null = null;
  let latestSnapshot: StorageUsageSnapshot | null = null;
  let latestJobId: string | null = null;
  let jobCounter = 0;

  const cancelCurrent = (): void => {
    currentJob?.cancel();
    currentJob = null;
  };

  const resolveRoot = async (rootId: StorageRootId) => {
    const roots = await deps.roots.resolveRoots();
    const root = roots.find((entry) => entry.id === rootId);
    if (!root) {
      throw new Error(`storage root not available: ${rootId}`);
    }
    return root;
  };

  return {
    async startScan() {
      cancelCurrent();
      const jobId = `scan-${++jobCounter}`;
      latestJobId = jobId;
      const roots = await deps.roots.resolveRoots();
      const job = createScanJob({
        jobId,
        roots,
        runner: deps.scanRunner,
        now,
        throttleMs,
        emit(snapshot) {
          if (jobId === latestJobId) {
            latestSnapshot = snapshot;
          }
          emitter.fire(snapshot);
        },
      });
      currentJob = job;
      void job.done.then(() => {
        if (currentJob?.jobId === jobId) {
          currentJob = null;
        }
      });
      return { jobId };
    },

    async cancelScan(jobId: string) {
      if (currentJob?.jobId === jobId) {
        cancelCurrent();
      }
    },

    async getSnapshot() {
      return latestSnapshot;
    },

    onScanProgress: emitter.event,

    async clean(request: StorageCleanRequest) {
      if (getStorageCategoryCleanability(request.categoryId) === "none") {
        throw new Error(`storage category is not cleanable: ${request.categoryId}`);
      }
      cancelCurrent();
      const root = await resolveRoot(request.rootId);
      const scopes = getStorageCleanScopes(request.categoryId);
      const candidates = await deps.cleaner.listCandidates(root.path, scopes);
      const plan = planStorageClean({
        categoryId: request.categoryId,
        candidates,
        context: {
          rootId: root.id,
          hasCustomDataBaseDir: root.hasCustomDataBaseDir,
        },
        now: now(),
      });
      const result = await deps.cleaner.deleteFiles(root.path, plan.targets, {
        keepDirectories: scopes.map((scope) => scope.prefix),
      });
      return { ...result, skippedCount: plan.skippedCount };
    },

    dispose() {
      cancelCurrent();
      emitter.dispose();
    },
  };
}
