import { getRemoteRuntimeToolsForPlatform, type RemoteResourcePackageId } from "@knorvia/shared";
import type { IRemoteBackend, RemoteEnvironment } from "@knorvia/server/remote/backend.js";
import {
  REMOTE_BASE,
  waitForClose,
  type DeployLoggers,
  type RemoteAssetDeployOptions,
} from "@knorvia/server/remote/deployShared.js";
import { buildWriteLiteralFileCommand } from "@knorvia/server/remote/posixShell.js";
import type { RemoteAssetInstaller } from "@knorvia/server/remote/remoteAssetInstaller.js";

export interface DeployRuntimeToolOptions extends RemoteAssetDeployOptions {
  platformArch: string;
  installer: RemoteAssetInstaller;
  selectedResourcePackageIds?: RemoteResourcePackageId[];
}

export async function deployRuntimeTools(
  backend: IRemoteBackend,
  env: RemoteEnvironment,
  options: DeployRuntimeToolOptions,
  loggers: DeployLoggers,
): Promise<void> {
  const platformArch = options.platformArch;

  for (const { toolId, runtime, version } of getRemoteRuntimeToolsForPlatform(env.platform)) {
    const componentId = runtime.bundledResourceDir as RemoteResourcePackageId;
    if (
      options.selectedResourcePackageIds &&
      !options.selectedResourcePackageIds.includes(componentId)
    ) {
      loggers.log(`[tool-deploy] ${toolId}: 未选择资源包 ${componentId}，跳过检查和部署`);
      continue;
    }

    const entrySegments = runtime.resolveEntrySegments(env.platform);
    const binaryName = entrySegments[entrySegments.length - 1];
    if (!binaryName) {
      loggers.logWarn(`[tool-deploy] ${toolId}: 无法解析 binary 名称，跳过部署`);
      continue;
    }

    const remoteToolDir = `${REMOTE_BASE}/tools/${runtime.bundledResourceDir}`;
    const versionFile = `${remoteToolDir}/.version`;
    const remoteBinaryPath = `${remoteToolDir}/${binaryName}`;
    let remoteVersion = "";
    try {
      remoteVersion = (await backend.readFile(versionFile)).trim();
    } catch {
      remoteVersion = "";
    }

    if (remoteVersion === version) {
      if (await backend.exists(remoteBinaryPath)) {
        loggers.log(`[tool-deploy] ${toolId}: 远程版本 ${version} 已是最新，跳过`);
        continue;
      }
      const action =
        options.installer.mode === "remote-download" ? "download required" : "upload required";
      loggers.logWarn(
        `[remote-assets] ${action}: component=${runtime.bundledResourceDir} reason=remote binary missing path=${remoteBinaryPath}`,
      );
    }

    loggers.log(`[tool-deploy] ${toolId}: 开始部署 ${version}`);
    await options.installer.installFile({
      componentId,
      sourceRelativePath: `tools/${platformArch}/${runtime.bundledResourceDir}/${binaryName}`,
      remotePath: remoteBinaryPath,
      executable: true,
    });
    const stream = await backend.exec(buildWriteLiteralFileCommand(versionFile, version));
    await waitForClose(stream);
    loggers.log(`[tool-deploy] ${toolId}: 部署完成 ${version}`);
  }
}
