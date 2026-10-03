import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import type { DockerContainerInfo } from "@knorvia/shared";

export type { DockerContainerInfo } from "@knorvia/shared";

interface DockerCommandOptions {
  env?: Record<string, string | undefined>;
  homeDir?: string;
  isExecutable?: (candidate: string) => boolean;
  platform?: NodeJS.Platform;
}

function isExecutableFile(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveDockerCommand(options: DockerCommandOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const check = options.isExecutable ?? isExecutableFile;
  const windows = platform === "win32";
  const names = windows ? ["docker.exe", "docker.cmd", "docker.bat", "docker"] : ["docker"];
  const pathApi = windows ? win32 : posix;

  for (const segment of (env.PATH ?? "").split(windows ? ";" : ":")) {
    const directory = segment.trim();
    if (!directory) continue;
    for (const name of names) {
      const candidate = pathApi.join(directory, name);
      if (check(candidate)) return candidate;
    }
  }

  const home = options.homeDir ?? homedir();
  let fallbacks: string[];
  switch (platform) {
    case "darwin":
      fallbacks = [
        "/usr/local/bin/docker",
        "/opt/homebrew/bin/docker",
        "/Applications/OrbStack.app/Contents/MacOS/xbin/docker",
        posix.join(home, ".orbstack/bin/docker"),
        "/Applications/Docker.app/Contents/Resources/bin/docker",
      ];
      break;
    case "linux":
      fallbacks = ["/usr/local/bin/docker", "/usr/bin/docker", "/snap/bin/docker"];
      break;
    case "win32":
      fallbacks = [
        "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
        "C:\\ProgramData\\DockerDesktop\\version-bin\\docker.exe",
      ];
      break;
    default:
      fallbacks = [];
  }
  for (const candidate of fallbacks) {
    if (check(candidate)) return candidate;
  }
  return "docker";
}

function executeDocker(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      resolveDockerCommand(),
      args,
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.replace(/\r/g, "").trim() || error.message));
          return;
        }
        resolve(stdout.replace(/\r/g, ""));
      },
    );
  });
}

export function parseDockerContainerList(rawOutput: string): DockerContainerInfo[] {
  const containers: DockerContainerInfo[] = [];
  for (const rawLine of rawOutput.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      if (!row.ID || !row.Names) continue;
      containers.push({
        id: row.ID,
        image: row.Image ?? "",
        name: row.Names,
        state: row.State ?? "",
        status: row.Status ?? "",
      });
    } catch {
      continue;
    }
  }
  return containers;
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await executeDocker(["version", "--format", "{{.Server.Version}}"]);
    return true;
  } catch {
    return false;
  }
}

export async function listDockerContainers(options?: {
  all?: boolean;
}): Promise<DockerContainerInfo[]> {
  const args = ["ps", ...(options?.all ? ["-a"] : []), "--format", "{{json .}}"];
  return parseDockerContainerList(await executeDocker(args));
}
