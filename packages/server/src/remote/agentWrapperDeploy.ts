import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IRemoteBackend } from "@knorvia/server/remote/backend.js";
import {
  buildRemoteExecutableReplaceCommand,
  waitForClose,
} from "@knorvia/server/remote/deployShared.js";
import { buildWriteLiteralFileCommand } from "@knorvia/server/remote/posixShell.js";

export function isWslBackend(backend: IRemoteBackend): boolean {
  return (backend as { kind?: string }).kind === "wsl";
}

export async function deployRemoteAgentWrapper(params: {
  backend: IRemoteBackend;
  content: string;
  remoteWrapperPath: string;
}): Promise<void> {
  const remoteWrapperTempPath = `${params.remoteWrapperPath}.new`;

  if (isWslBackend(params.backend)) {
    const localTempPath = join(tmpdir(), `agent-wrapper-${process.pid}-${Date.now()}.sh`);
    try {
      await writeFile(localTempPath, params.content, "utf8");
      await params.backend.upload(localTempPath, remoteWrapperTempPath);
      const stream = await params.backend.exec(
        buildRemoteExecutableReplaceCommand(remoteWrapperTempPath, params.remoteWrapperPath),
      );
      await waitForClose(stream);
    } finally {
      await rm(localTempPath, { force: true });
    }
    return;
  }

  const stream = await params.backend.exec(
    [
      buildWriteLiteralFileCommand(remoteWrapperTempPath, params.content),
      buildRemoteExecutableReplaceCommand(remoteWrapperTempPath, params.remoteWrapperPath),
    ].join(" && "),
  );
  await waitForClose(stream);
}
