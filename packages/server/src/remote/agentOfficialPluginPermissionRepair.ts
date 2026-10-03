import { KNORVIA_AGENT_PROVIDER } from "@knorvia/shared";
import type { IRemoteBackend } from "@knorvia/server/remote/backend.js";
import { type DeployLoggers, waitForClose } from "@knorvia/server/remote/deployShared.js";
import { quotePosixPathArg } from "@knorvia/server/remote/posixShell.js";

export async function repairLegacyRemoteOfficialPluginDirectoryPermissions(params: {
  backend: IRemoteBackend;
  loggers: DeployLoggers;
  remoteOfficialPluginDir: string;
}): Promise<boolean> {
  params.loggers.logWarn(
    `[agent-deploy] ${KNORVIA_AGENT_PROVIDER}: 检查并修复旧 builtin plugin 目录权限 ${params.remoteOfficialPluginDir}`,
  );

  const quoted = quotePosixPathArg(params.remoteOfficialPluginDir);
  const stream = await params.backend.exec(
    `if [ -d ${quoted} ]; then command chmod -R u+rwX ${quoted}; fi`,
  );

  try {
    await waitForClose(stream);
    return true;
  } catch (error) {
    params.loggers.logWarn(
      `[agent-deploy] ${KNORVIA_AGENT_PROVIDER}: 修复旧 builtin plugin 目录权限失败，将继续尝试替换 packages: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}
