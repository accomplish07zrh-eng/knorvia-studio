/* eslint-disable max-lines -- Complete development owner keeps local hashing and its owned staging transaction together. */
import { createHash, randomUUID, type Hash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { KNORVIA_AGENT_PROVIDER, resolveKnorviaRuntimeEnv } from "@knorvia/shared";
import type { IRemoteBackend } from "@knorvia/server/remote/backend.js";
import {
  buildRemoteExecutableReplaceCommand,
  buildRemoteMoveCommand,
  waitForClose,
  type DeployLoggers,
} from "@knorvia/server/remote/deployShared.js";
import {
  buildWriteLiteralFileCommand,
  quotePosixPathArg,
} from "@knorvia/server/remote/posixShell.js";
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
  REMOTE_AGENT_OFFICIAL_PLUGIN_REQUIRED_RELATIVE_PATHS,
  REMOTE_AGENT_OFFICIAL_PLUGIN_DIR_NAME,
  REMOTE_AGENT_OFFICIAL_PLUGIN_INCLUDED_TOP_LEVEL_PATHS,
  REMOTE_AGENT_OFFICIAL_PLUGIN_PACKAGE_NAMES,
} from "@knorvia/server/remote/agentOfficialPluginAssets.js";
import { repairLegacyRemoteOfficialPluginDirectoryPermissions } from "@knorvia/server/remote/agentOfficialPluginPermissionRepair.js";
import { createTarGzArchive } from "@knorvia/server/remote/localTarGz.js";

interface DevelopmentKnorviaAgentRuntimeParams {
  runtimeVersion: string;
  runtimeResourceDir: string;
  remoteProviderDir: string;
  remoteVersionFile: string;
  remoteBinaryPath: string;
  force: boolean;
}

interface LocalDevelopmentBundle {
  repoRoot: string;
  localPath: string;
}

function findLocalDevelopmentBundle(): LocalDevelopmentBundle | null {
  if (resolveKnorviaRuntimeEnv(process.env) !== "development") return null;
  const flag = process.env.KNORVIA_REMOTE_DEV_AGENT_BUNDLE?.trim().toLowerCase();
  const enabled =
    flag === "1" || flag === "true" || (flag !== "0" && flag !== "false" && !process.env.VITEST);
  if (!enabled) return null;
  let directory = resolve(process.cwd());
  for (;;) {
    const localPath = join(directory, "apps", "cli", "packages", "cli", "dist", "knorvia.cjs");
    if (existsSync(localPath)) return { repoRoot: directory, localPath };
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function officialPackageRoot(repoRoot: string, packageName: string): string {
  return join(repoRoot, "apps", "cli", "packages", packageName);
}

function validateOfficialPackage(packageRoot: string, packageName: string): void {
  const manifestPath = join(packageRoot, ".knorvia-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`[agent-deploy] missing official plugin manifest: ${manifestPath}`);
  }
  const prefix = `${packageName}/`;
  for (const relativePath of REMOTE_AGENT_OFFICIAL_PLUGIN_REQUIRED_RELATIVE_PATHS) {
    if (!relativePath.startsWith(prefix)) continue;
    const requiredPath = join(packageRoot, ...relativePath.slice(prefix.length).split("/"));
    if (!existsSync(requiredPath)) {
      throw new Error(`[agent-deploy] missing official plugin required asset: ${requiredPath}`);
    }
  }
}

async function hashLocalPath(hash: Hash, filePath: string, relativePath: string): Promise<void> {
  const stat = await lstat(filePath);
  if (stat.isDirectory()) {
    hash.update(`dir:${relativePath}\n`);
    const names = await readdir(filePath);
    names.sort((left, right) => left.localeCompare(right, "en"));
    for (const name of names) {
      await hashLocalPath(hash, join(filePath, name), `${relativePath}/${name}`);
    }
  } else if (stat.isSymbolicLink()) {
    hash.update(`symlink:${relativePath}:${await readlink(filePath)}\n`);
  } else if (stat.isFile()) {
    hash.update(`file:${relativePath}:${stat.mode & 0o777}:${stat.size}\n`);
    hash.update(await readFile(filePath));
  }
}

async function hashOfficialPackage(
  hash: Hash,
  repoRoot: string,
  packageName: string,
): Promise<void> {
  const packageRoot = officialPackageRoot(repoRoot, packageName);
  validateOfficialPackage(packageRoot, packageName);
  for (const includedPath of REMOTE_AGENT_OFFICIAL_PLUGIN_INCLUDED_TOP_LEVEL_PATHS) {
    const source = join(packageRoot, includedPath);
    if (existsSync(source)) {
      await hashLocalPath(hash, source, `${packageName}/${includedPath}`);
    }
  }
}

async function computeDevelopmentVersion(bundle: LocalDevelopmentBundle): Promise<string> {
  const hash = createHash("sha256");
  hash.update("bundle:knorvia.cjs\n");
  hash.update(await readFile(bundle.localPath));
  for (const packageName of REMOTE_AGENT_OFFICIAL_PLUGIN_PACKAGE_NAMES) {
    hash.update(`plugin:${packageName}\n`);
    await hashOfficialPackage(hash, bundle.repoRoot, packageName);
  }
  return hash.digest("hex");
}

async function stageOfficialPackages(repoRoot: string, packagesDir: string): Promise<void> {
  await mkdir(packagesDir, { recursive: true });
  for (const packageName of REMOTE_AGENT_OFFICIAL_PLUGIN_PACKAGE_NAMES) {
    const packageRoot = officialPackageRoot(repoRoot, packageName);
    validateOfficialPackage(packageRoot, packageName);
    const targetPackage = join(packagesDir, packageName);
    await mkdir(targetPackage, { recursive: true });
    for (const includedPath of REMOTE_AGENT_OFFICIAL_PLUGIN_INCLUDED_TOP_LEVEL_PATHS) {
      const source = join(packageRoot, includedPath);
      if (existsSync(source)) {
        await cp(source, join(targetPackage, includedPath), { recursive: true });
      }
    }
  }
}

async function uploadOfficialPlugins(
  backend: IRemoteBackend,
  repoRoot: string,
  remoteProviderDir: string,
  loggers: DeployLoggers,
): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "knorvia-remote-agent-packages-"));
  const dirName = REMOTE_AGENT_OFFICIAL_PLUGIN_DIR_NAME;
  const packagesDir = join(tempDir, dirName);
  const archivePath = join(tempDir, `${dirName}.tar.gz`);
  try {
    await stageOfficialPackages(repoRoot, packagesDir);
    await createTarGzArchive(archivePath, [{ sourcePath: packagesDir, archivePath: dirName }]);
    const ownerSuffix = `${Date.now()}-${randomUUID()}`;
    const remoteArchive = `${remoteProviderDir}/${dirName}.tar.gz-${ownerSuffix}`;
    const remoteExtract = `${remoteProviderDir}/${dirName}.extract-${ownerSuffix}`;
    const extracted = `${remoteExtract}/${dirName}`;
    const quote = quotePosixPathArg;
    const cleanupOwnedStaging = async (): Promise<void> => {
      try {
        await waitForClose(
          await backend.exec(`rm -f ${quote(remoteArchive)} && rm -rf ${quote(remoteExtract)}`),
        );
      } catch (error) {
        loggers.logWarn(
          `[agent-deploy] ${KNORVIA_AGENT_PROVIDER}: 清理 owner staging 失败 (${ownerSuffix}): ${String(error)}`,
        );
      }
    };
    loggers.log(`[agent-deploy] ${KNORVIA_AGENT_PROVIDER}: 开发态上传官方插件资源`);
    try {
      await backend.upload(archivePath, remoteArchive);
      await repairLegacyRemoteOfficialPluginDirectoryPermissions({
        backend,
        loggers,
        remoteOfficialPluginDir: buildRemoteAgentOfficialPluginDir(remoteProviderDir),
      });
      const commands = [
        "set -eu",
        `cleanup_staging() { rm -f ${quote(remoteArchive)}; rm -rf ${quote(remoteExtract)}; }`,
        "trap cleanup_staging EXIT HUP INT TERM",
        `rm -rf ${quote(remoteExtract)}`,
        `mkdir -p ${quote(remoteExtract)} ${quote(remoteProviderDir)}`,
        `tar -xzf ${quote(remoteArchive)} -C ${quote(remoteExtract)}`,
        `test -d ${quote(extracted)}`,
        `rm -rf ${quote(`${remoteProviderDir}/${dirName}`)}`,
        buildRemoteMoveCommand(extracted, `${remoteProviderDir}/${dirName}`),
        "cleanup_staging",
        "trap - EXIT HUP INT TERM",
      ];
      await waitForClose(await backend.exec(commands.join("\n")));
    } catch (error) {
      // 清理只触及本次 owner 的随机 staging 路径，失败也保留最初的部署异常。
      await cleanupOwnedStaging();
      throw error;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function deployDevelopmentKnorviaAgentRuntime(
  backend: IRemoteBackend,
  params: DevelopmentKnorviaAgentRuntimeParams,
  loggers: DeployLoggers,
): Promise<boolean> {
  const bundle = findLocalDevelopmentBundle();
  if (!bundle) return false;
  const remoteBundle = `${params.remoteProviderDir}/${REMOTE_AGENT_BUNDLE_NAME}`;
  const remoteDevVersion = `${params.remoteProviderDir}/.dev-version`;
  const devVersion = await computeDevelopmentVersion(bundle);
  const missingPluginPaths: string[] = [];
  for (const path of buildRemoteAgentOfficialPluginRequiredPaths(params.remoteProviderDir)) {
    if (!(await backend.exists(path))) missingPluginPaths.push(path);
  }
  const canSkip = async (): Promise<boolean> => {
    const skipParams = {
      runtimeVersion: params.runtimeVersion,
      runtimeResourceDir: params.runtimeResourceDir,
      remoteVersionFile: params.remoteVersionFile,
      remoteBinaryPath: params.remoteBinaryPath,
      force: params.force,
    };
    if (skipParams.force) return false;
    let runtimeVersion: string;
    let deployedDevVersion: string;
    try {
      runtimeVersion = (await backend.readFile(skipParams.remoteVersionFile)).trim();
      deployedDevVersion = (await backend.readFile(remoteDevVersion)).trim();
    } catch {
      return false;
    }
    if (runtimeVersion !== skipParams.runtimeVersion || deployedDevVersion !== devVersion)
      return false;
    if (!(await backend.exists(skipParams.remoteBinaryPath))) return false;
    if (isWslBackend(backend)) {
      try {
        const content = await backend.readFile(skipParams.remoteBinaryPath);
        if (!isRemoteAgentBundleWrapperCurrent(content, skipParams.runtimeResourceDir))
          return false;
      } catch {
        return false;
      }
    }
    if (!(await backend.exists(remoteBundle))) return false;
    return missingPluginPaths.length === 0;
  };
  if (await canSkip()) {
    loggers.log(`[agent-deploy] ${KNORVIA_AGENT_PROVIDER}: 开发态 knorvia.cjs 未变化，跳过`);
    return true;
  }
  loggers.log(
    `[agent-deploy] ${KNORVIA_AGENT_PROVIDER}: 开发态上传本地 knorvia.cjs ${devVersion.slice(0, 12)}`,
  );
  await waitForClose(await backend.exec(`mkdir -p ${quotePosixPathArg(params.remoteProviderDir)}`));
  const remoteBundleTemp = `${remoteBundle}.new`;
  await backend.upload(bundle.localPath, remoteBundleTemp);
  await waitForClose(await backend.exec(buildRemoteMoveCommand(remoteBundleTemp, remoteBundle)));
  await uploadOfficialPlugins(backend, bundle.repoRoot, params.remoteProviderDir, loggers);
  const wrapper = buildRemoteAgentBundleWrapper(params.runtimeResourceDir);
  const markers = [
    buildWriteLiteralFileCommand(remoteDevVersion, devVersion),
    buildWriteLiteralFileCommand(params.remoteVersionFile, params.runtimeVersion),
  ];
  let commands: string[];
  if (isWslBackend(backend)) {
    await deployRemoteAgentWrapper({
      backend,
      content: wrapper,
      remoteWrapperPath: params.remoteBinaryPath,
    });
    commands = markers;
  } else {
    const remoteWrapperTemp = `${params.remoteBinaryPath}.new`;
    commands = [
      buildWriteLiteralFileCommand(remoteWrapperTemp, wrapper),
      buildRemoteExecutableReplaceCommand(remoteWrapperTemp, params.remoteBinaryPath),
      ...markers,
    ];
  }
  await waitForClose(await backend.exec(commands.join(" && ")));
  loggers.log(
    `[agent-deploy] ${KNORVIA_AGENT_PROVIDER}: 开发态部署完成 ${devVersion.slice(0, 12)}`,
  );
  return true;
}
