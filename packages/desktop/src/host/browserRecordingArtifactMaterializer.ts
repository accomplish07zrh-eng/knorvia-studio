import { copyFile, mkdir, rename, rm } from "node:fs/promises";

import { dirname, posix, relative, resolve } from "node:path";

import { randomUUID } from "node:crypto";

import type { IRemoteBackend } from "@knorvia/server/remote";

import type { BrowserRecordingArtifact } from "@knorvia/shared";

export async function materializeBrowserRecordingArtifact(input: {
  artifact: BrowserRecordingArtifact;
  localPath: string;
  outputPath: string;
  workspacePath: string;
  remoteSessionId?: string;
  remoteBackend?: Pick<IRemoteBackend, "upload">;
}): Promise<BrowserRecordingArtifact> {
  if (input.remoteSessionId) {
    if (!input.remoteBackend) {
      throw new Error("remote Browser recording materialization is unavailable for this session");
    }

    const workspace = posix.normalize(input.workspacePath.replace(/\\/g, "/"));
    const segments = input.outputPath.split(/[\\/]+/);
    const output = posix.normalize(input.outputPath.replace(/\\/g, "/"));

    if (
      segments.some((segment) => segment === ".." || segment === "." || segment === "") ||
      output === ".." ||
      output.startsWith("../") ||
      posix.isAbsolute(output)
    ) {
      throw new Error("recording outputPath must stay inside the remote workspace");
    }
    if (!output.toLowerCase().endsWith(".webm")) {
      throw new Error("recording outputPath must end with .webm");
    }

    const target = posix.join(workspace, output);
    await input.remoteBackend.upload(input.localPath, target);
    return { ...input.artifact, path: target };
  }

  const root = resolve(input.workspacePath);
  const target = resolve(root, input.outputPath);
  const relation = relative(root, target);
  if (relation === "" || relation.startsWith("..") || resolve(root, relation) !== target) {
    throw new Error("recording outputPath must stay inside the workspace");
  }
  if (!target.toLowerCase().endsWith(".webm")) {
    throw new Error("recording outputPath must end with .webm");
  }

  await mkdir(dirname(target), { recursive: true });
  const staging = target + ".knorvia-studio-recording-" + randomUUID() + ".tmp";
  try {
    await copyFile(input.localPath, staging);
    await rm(target, { force: true });
    await rename(staging, target);
  } finally {
    await rm(staging, { force: true }).catch(() => undefined);
  }
  return { ...input.artifact, path: target };
}
