import {
  getTasksIndexDatabasePath,
  markTasksStoragePrepared,
  resolveKnorviaAgentSpawnCwd,
} from "@knorvia/services/storage-startup";
import type { DatabaseStartupState } from "@knorvia/shared";
import { DatabaseStartupCoordinator } from "./databaseStartupCoordinator.js";
import { StartupDiskSampler } from "./startupDiskSampler.js";
import { prepareHostStorage, prepareSessionStorage } from "./storagePreparationProcesses.js";

const BASELINE_BUDGET_MS = 250;
export function createHostDatabaseStartup(options: {
  startupId?: string;
  cwd: string;
  workingDirectories?: string[];
  env?: Record<string, string>;
  publish: (state: DatabaseStartupState) => void;
  initializeServices: () => Promise<void>;
  onFailure: (error: unknown) => void;
}) {
  const abort = new AbortController();
  let sampler: StartupDiskSampler | undefined;
  const coordinator = new DatabaseStartupCoordinator({
    startupId: options.startupId,
    publish: options.publish,
    prepare: async (report) => {
      const preparedPaths = new Set<string>();
      sampler = new StartupDiskSampler({ onSample: (disk) => coordinator.updateDisk(disk) });
      const currentSampler = sampler;
      const observePath = async (path: string) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            currentSampler.addPath(path),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, BASELINE_BUDGET_MS);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        currentSampler.sealBaseline(path);
        coordinator.updateDisk(currentSampler.snapshot());
      };
      try {
        report("preparing_host_storage", "checking");
        const tasksPath = getTasksIndexDatabasePath();
        await observePath(tasksPath);
        currentSampler.start();

        // tasks-index 与 CLI 会话库是不同文件、不同 WAL，互不依赖；串行等待会把两者的
        // 固定成本相加。这里并行准备，但保持原有可观察行为：
        // 阶段通知仍按「host storage → session storage」的顺序发出（会话阶段先缓冲），
        // 失败优先级也仍按同一顺序判定。
        const tasksStorage = prepareHostStorage(
          tasksPath,
          (phase, migration) =>
            report("preparing_host_storage", phase, { databaseId: "tasks-index", migration }),
          abort.signal,
        );
        const candidates = options.workingDirectories?.length
          ? options.workingDirectories
          : [options.cwd];
        const directories = new Set<string>();
        for (const candidate of candidates) {
          // 历史项目 ENOTDIR/无权限不是数据库失败；与普通 Agent 使用同一 cwd 选择规则。
          const { cwd } = await resolveKnorviaAgentSpawnCwd({
            requestedCwd: candidate,
            workspacePath: candidate,
            spawnFallbackCwd: options.cwd,
          });
          directories.add(cwd);
        }
        // 相对 sessionDbPath 按实际进程 cwd 解析；不能先准备 fallback 下的另一个空库。
        const pendingDirectories = [...directories];
        // 会话阶段通知在 tasks-index 结束前先缓冲，避免界面阶段在两者之间来回跳动。
        let sessionReportMode: "buffer" | "emit" | "drop" = "buffer";
        const bufferedSessionReports: Array<() => void> = [];
        const onSessionReport = (emit: () => void) => {
          if (sessionReportMode === "emit") emit();
          else if (sessionReportMode === "buffer") bufferedSessionReports.push(emit);
        };
        onSessionReport(() => report("preparing_session_storage", "checking"));
        const sessionStorage = (async () => {
          for (const [index, cwd] of pendingDirectories.entries())
            await prepareSessionStorage({
              cwd,
              env: options.env,
              signal: abort.signal,
              preparedPaths,
              report: (phase, details) =>
                onSessionReport(() =>
                  report("preparing_session_storage", phase, {
                    databaseId: details?.databaseId ?? "session",
                    migration: details?.migration,
                    finalDatabase: index === pendingDirectories.length - 1,
                  }),
                ),
              observePath,
            });
        })();
        // tasks-index 先失败时会话库仍可能在运行：先挂一个空处理器，避免未处理拒绝，
        // 真正的拒绝仍会在下面的 await 处抛出。
        sessionStorage.catch(() => {});
        try {
          await tasksStorage;
        } catch (error) {
          // 失败直接进入 failed 状态，不补发缓冲的阶段通知。
          sessionReportMode = "drop";
          bufferedSessionReports.length = 0;
          throw error;
        }
        markTasksStoragePrepared(tasksPath);
        sessionReportMode = "emit";
        for (const emit of bufferedSessionReports.splice(0)) emit();
        await sessionStorage;
        report("starting_services");
        await options.initializeServices();
      } catch (error) {
        try {
          options.onFailure(error);
        } catch {
          /* 诊断失败不覆盖原始错误。 */
        }
        throw error;
      } finally {
        currentSampler.stop();
        coordinator.updateDisk(currentSampler.snapshot());
      }
    },
  });
  return {
    coordinator,
    dispose: () => {
      abort.abort();
      sampler?.stop();
    },
  };
}
