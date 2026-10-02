import {
  KNORVIA_AGENT_PROVIDER,
  KNORVIA_AGENT_RUNTIME,
  type RemoteResourcePackageId,
} from "@knorvia/shared";
import type { IRemoteBackend, RemoteEnvironment } from "@knorvia/server/remote/backend.js";
import {
  REMOTE_BASE,
  waitForClose,
  type DeployLoggers,
  type RemoteAssetDeployOptions,
} from "@knorvia/server/remote/deployShared.js";
import { buildWriteLiteralFileCommand } from "@knorvia/server/remote/posixShell.js";
import {
  REMOTE_AGENT_BUNDLE_NAME,
  buildRemoteAgentBundleWrapper,
  isRemoteAgentBundleWrapperCurrent,
} from "@knorvia/server/remote/agentBundleWrapper.js";
import {
  deployRemoteAgentWrapper,
  isWslBackend,
} from "@knorvia/server/remote/agentWrapperDeploy.js";
import {
  buildRemoteAgentOfficialPluginDir,
  buildRemoteAgentOfficialPluginRequiredPaths,
  buildRemoteAgentOfficialPluginSourceRelativePath,
  REMOTE_AGENT_OFFICIAL_PLUGIN_REQUIRED_RELATIVE_PATHS,
} from "@knorvia/server/remote/agentOfficialPluginAssets.js";
import { repairLegacyRemoteOfficialPluginDirectoryPermissions } from "@knorvia/server/remote/agentOfficialPluginPermissionRepair.js";
import {
  checkRemoteAssetComponentIdentity,
  writeRemoteAssetComponentMeta,
} from "@knorvia/server/remote/remoteAssetLiveIdentity.js";
import type { RemoteAssetInstaller } from "@knorvia/server/remote/remoteAssetInstaller.js";
import { deployDevelopmentKnorviaAgentRuntime } from "@knorvia/server/remote/agentDevDeploy.js";

export interface DeployKnorviaAgentRuntimeOptions extends RemoteAssetDeployOptions {
  platformArch: string;
  installer: RemoteAssetInstaller;
  selectedResourcePackageIds?: RemoteResourcePackageId[];
  force?: boolean;
}

export async function deployKnorviaAgentRuntime(
  backend: IRemoteBackend,
  env: RemoteEnvironment,
  options: DeployKnorviaAgentRuntimeOptions,
  loggers: DeployLoggers,
): Promise<void> {
  const provider = KNORVIA_AGENT_PROVIDER;
  const runtime = KNORVIA_AGENT_RUNTIME;
  const componentId = provider;
  if (
    options.selectedResourcePackageIds !== undefined &&
    !options.selectedResourcePackageIds.includes(componentId)
  ) {
    loggers.log(`[agent-deploy] ${provider}: 未选择资源包 ${componentId}，跳过检查和部署`);
    return;
  }

  const entrySegments = runtime.resolveEntrySegments(env.platform);
  const binaryName = entrySegments[entrySegments.length - 1];
  if (!binaryName) {
    loggers.logWarn(`[agent-deploy] ${provider}: 无法解析 agent 入口名称，跳过部署`);
    return;
  }
  const remoteProviderDir = `${REMOTE_BASE}/agents/${runtime.bundledResourceDir}`;
  const remoteVersionFile = `${remoteProviderDir}/.version`;
  const remoteBinaryPath = `${remoteProviderDir}/${binaryName}`;
  const remoteBundlePath = `${remoteProviderDir}/${REMOTE_AGENT_BUNDLE_NAME}`;
  const remoteOfficialPluginDir = buildRemoteAgentOfficialPluginDir(remoteProviderDir);
  const missingPluginPaths: string[] = [];
  for (const path of buildRemoteAgentOfficialPluginRequiredPaths(remoteProviderDir)) {
    if (!(await backend.exists(path))) missingPluginPaths.push(path);
  }

  if (
    await deployDevelopmentKnorviaAgentRuntime(
      backend,
      {
        runtimeVersion: runtime.version,
        runtimeResourceDir: runtime.bundledResourceDir,
        remoteProviderDir,
        remoteVersionFile,
        remoteBinaryPath,
        force: Boolean(options.force),
      },
      loggers,
    )
  ) {
    return;
  }

  let expectedArtifactSha: string | null = null;
  try {
    expectedArtifactSha = (await options.installer.resolveComponentSha256?.(componentId)) ?? null;
  } catch (error) {
    loggers.logWarn(
      `[agent-deploy] ${provider}: 读取 manifest SHA 失败，将重新部署: ${String(error)}`,
    );
  }
  const canSkip = async (): Promise<boolean> => {
    const force = Boolean(options.force);
    const platformArch = options.platformArch;
    const runtimeResourceDir = runtime.bundledResourceDir;
    const installer = options.installer;
    const expectedSha = expectedArtifactSha;
    const warnRequired = (reason: string): void => {
      const action = installer.mode === "remote-download" ? "download" : "upload";
      loggers.logWarn(
        `[remote-assets] ${action} required: component=${componentId} reason=${reason}`,
      );
    };
    if (force) return false;
    if (!expectedSha) {
      warnRequired("manifest SHA unavailable");
      return false;
    }
    const identity = await checkRemoteAssetComponentIdentity(backend, {
      componentId,
      platformArch,
      expectedIdentity: { sha256: expectedSha },
    });
    if (identity.shouldDeploy) {
      warnRequired(identity.reason);
      return false;
    }
    if (!(await backend.exists(remoteBinaryPath))) {
      warnRequired(`remote wrapper missing path=${remoteBinaryPath}`);
      return false;
    }
    if (isWslBackend(backend)) {
      try {
        const content = await backend.readFile(remoteBinaryPath);
        if (!isRemoteAgentBundleWrapperCurrent(content, runtimeResourceDir)) {
          warnRequired(`wsl wrapper stale path=${remoteBinaryPath}`);
          return false;
        }
      } catch {
        return false;
      }
    }
    if (!(await backend.exists(remoteBundlePath))) {
      warnRequired(`remote bundle missing path=${remoteBundlePath}`);
      return false;
    }
    if (missingPluginPaths.length > 0) {
      warnRequired(`official plugin assets missing paths=${missingPluginPaths.join(",")}`);
      return false;
    }
    return true;
  };
  if (await canSkip()) {
    loggers.log(`[agent-deploy] ${provider}: 制品 SHA ${expectedArtifactSha} 已部署，跳过`);
    return;
  }

  loggers.log(`[agent-deploy] ${provider}: 开始部署 v${runtime.version}...`);
  const forceRefresh = Boolean(options.force);
  const repairedPermissions = await repairLegacyRemoteOfficialPluginDirectoryPermissions({
    backend,
    loggers,
    remoteOfficialPluginDir,
  });
  const installBundle = (): Promise<void> => {
    return options.installer.installFile({
      componentId,
      sourceRelativePath: `${runtime.bundledResourceDir}/${options.platformArch}/${REMOTE_AGENT_BUNDLE_NAME}`,
      remotePath: remoteBundlePath,
      executable: false,
      forceRefresh,
    });
  };
  const installPlugins = (): Promise<void> => {
    return options.installer.installDirectory({
      componentId,
      sourceRelativePath: buildRemoteAgentOfficialPluginSourceRelativePath({
        runtimeResourceDir: runtime.bundledResourceDir,
        platformArch: options.platformArch,
      }),
      remoteDir: remoteOfficialPluginDir,
      requiredRelativePaths: [...REMOTE_AGENT_OFFICIAL_PLUGIN_REQUIRED_RELATIVE_PATHS],
      forceRefresh,
    });
  };
  if (repairedPermissions) {
    await installBundle();
    await installPlugins();
  } else {
    // 插件替换失败时不得提前更新 bundle；修复权限后的顺序由既有端口契约决定。
    await installPlugins();
    await installBundle();
  }
  await deployRemoteAgentWrapper({
    backend,
    content: buildRemoteAgentBundleWrapper(runtime.bundledResourceDir),
    remoteWrapperPath: remoteBinaryPath,
  });
  await waitForClose(
    await backend.exec(buildWriteLiteralFileCommand(remoteVersionFile, runtime.version)),
  );
  if (expectedArtifactSha) {
    await writeRemoteAssetComponentMeta(backend, {
      id: componentId,
      version: runtime.version,
      sha256: expectedArtifactSha,
      platformArch: options.platformArch,
    });
  }
  loggers.log(`[agent-deploy] ${provider}: 部署完成 v${runtime.version}`);
}
