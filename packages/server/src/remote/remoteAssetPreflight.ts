import type { IRemoteBackend, StdioStream } from "@knorvia/server/remote/backend.js";
import { waitForClose } from "@knorvia/server/remote/deployShared.js";

export type RemoteDownloadTool = "curl" | "wget";
export type RemoteSha256Tool = "sha256sum" | "shasum" | "openssl";

export interface RemoteAssetTools {
  download: RemoteDownloadTool;
  tar: "tar";
  sha256: RemoteSha256Tool;
}

async function collectStdout(stream: StdioStream): Promise<string> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    let drainTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = () => {
      if (settled) return;
      settled = true;
      if (drainTimer !== undefined) clearTimeout(drainTimer);
      drainTimer = undefined;
      resolve(output);
    };
    const scheduleDrain = () => {
      if (settled) return;
      if (drainTimer !== undefined) clearTimeout(drainTimer);
      drainTimer = setTimeout(settle, 50);
    };

    stream.stdout.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
      if (drainTimer !== undefined) scheduleDrain();
    });
    stream.stdout.on("end", settle);
    stream.stdout.on("close", settle);
    stream.stdout.on("error", settle);
    stream.onClose(scheduleDrain);
  });
}

export async function detectRemoteAssetTools(
  backend: IRemoteBackend,
  loggers: { log: (...args: unknown[]) => void },
): Promise<RemoteAssetTools> {
  loggers.log("[remote-assets] preflight: checking remote download tools");
  const command = [
    "download=",
    "if command -v curl >/dev/null 2>&1; then download=curl; elif command -v wget >/dev/null 2>&1; then download=wget; fi",
    "tar_tool=",
    "if command -v tar >/dev/null 2>&1; then tar_tool=tar; fi",
    "sha_tool=",
    "if command -v sha256sum >/dev/null 2>&1; then sha_tool=sha256sum; elif command -v shasum >/dev/null 2>&1; then sha_tool=shasum; elif command -v openssl >/dev/null 2>&1; then sha_tool=openssl; fi",
    `printf 'download=%s\ntar=%s\nsha256=%s\n' "$download" "$tar_tool" "$sha_tool"`,
  ].join("; ");
  const stream = await backend.exec(command);
  const stdoutPromise = collectStdout(stream);
  await waitForClose(stream);
  const stdout = await stdoutPromise;
  const values: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) {
      values[line.slice(0, separator)] = line.slice(separator + 1).trim();
    }
  }

  const download = values.download;
  if (download !== "curl" && download !== "wget") {
    throw new Error(
      "远端服务器缺少 curl 或 wget，无法直接下载 Knorvia Studio 远程资源。请安装 curl/wget，或切回“本地下载后上传”。",
    );
  }
  const tar = values.tar;
  if (tar !== "tar") {
    throw new Error(
      "远端服务器缺少 tar，无法解压 Knorvia Studio 远程资源。请安装 tar，或切回“本地下载后上传”。",
    );
  }
  const sha256 = values.sha256;
  if (sha256 !== "sha256sum" && sha256 !== "shasum" && sha256 !== "openssl") {
    throw new Error(
      "远端服务器缺少 sha256sum、shasum 或 openssl，无法校验 Knorvia Studio 远程资源。请安装其中一个校验工具，或切回“本地下载后上传”。",
    );
  }
  loggers.log(
    `[remote-assets] preflight: selected tools download=${download} tar=${tar} sha256=${sha256}`,
  );
  return { download, tar, sha256 };
}
