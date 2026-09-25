import type { StudioKernelId, StudioKernelStatus } from "../kernelTypes.js";
import { validateStudioKernelManagement } from "../domain/validation.js";
import { parseRemoteStudioKernelId } from "../domain/remoteAgentIdentity.js";
import type { StudioKernelRegistry } from "./ports.js";
import type { StudioRepository } from "./storePort.js";
import { studioKernelConfig, studioKernelConfigs } from "./runtimeProjections.js";

type KernelDeps = { db: StudioRepository; kernels: StudioKernelRegistry };

/** 合并本机探测结果与已知的 SSH 远端内核状态；断开的远端显示为未安装。 */
export async function inspectStudioKernels(deps: KernelDeps): Promise<StudioKernelStatus[]> {
  const live = await deps.kernels.inspect(studioKernelConfigs(deps.db));
  const remote = live.filter((status) => parseRemoteStudioKernelId(status.id));
  const known = deps.db.list<StudioKernelStatus>("remote-kernel-status", { limit: 10_000 });
  deps.db.transaction(() => {
    for (const status of remote) {
      const saved = { ...status, executablePath: undefined };
      const previous = deps.db.read<StudioKernelStatus>("remote-kernel-status", status.id);
      if (JSON.stringify(previous) !== JSON.stringify(saved))
        deps.db.write("remote-kernel-status", status.id, saved);
    }
  });
  const liveIds = new Set(remote.map((status) => status.id));
  return [
    ...live,
    ...known
      .filter((status) => !liveIds.has(status.id))
      .map((status) => ({ ...status, installed: false, error: "SSH 连接已断开" })),
  ];
}

export async function manageStudioKernel(
  deps: KernelDeps,
  params: {
    kernel: StudioKernelId;
    action: "install" | "update" | "uninstall" | "update-existing";
  },
  changed: () => void,
): Promise<StudioKernelStatus> {
  validateStudioKernelManagement(params);
  if (deps.db.list("active").length) throw new Error("请先停止运行中的任务，再管理内核安装");
  const previous = studioKernelConfig(deps.db, params.kernel);
  const before = (await deps.kernels.inspect(studioKernelConfigs(deps.db))).find(
    (item) => item.id === params.kernel,
  );
  const status = await deps.kernels.manage(params.kernel, params.action);
  // 管理操作成功后由服务持久化受管路径；UI 断开不会留下已卸载或过时的配置。
  if (
    params.action !== "update-existing" &&
    (!previous.executablePath || before?.origin === "managed")
  ) {
    deps.db.transaction(() => {
      const latest = studioKernelConfig(deps.db, params.kernel);
      if (latest.executablePath !== previous.executablePath) return;
      deps.db.write("config", params.kernel, {
        ...latest,
        executablePath: params.action === "uninstall" ? "" : (status.executablePath ?? ""),
      });
    });
    changed();
  }
  return status;
}
