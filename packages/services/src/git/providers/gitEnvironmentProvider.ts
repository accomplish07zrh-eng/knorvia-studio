import { spawn } from "node:child_process";
import {
  DEFAULT_GIT_DISCOVERY_TIMEOUT_MS,
  getGitBinaryCandidates,
  getGitCommandEnv,
} from "../config.js";

export interface GitEnvironmentProvider {
  resolveGitBinary(): Promise<string | null>;
  createCommandEnv(): NodeJS.ProcessEnv;
}

async function probeGitBinary(candidate: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const child = spawn(candidate, ["--version"], {
      env,
      stdio: "ignore",
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, DEFAULT_GIT_DISCOVERY_TIMEOUT_MS);

    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export function createGitEnvironmentProvider(): GitEnvironmentProvider {
  let discovery: Promise<string | null> | null = null;

  return {
    async resolveGitBinary() {
      if (discovery) {
        return await discovery;
      }

      const env = getGitCommandEnv();
      discovery = (async () => {
        for (const candidate of getGitBinaryCandidates()) {
          if (await probeGitBinary(candidate, env)) {
            return candidate;
          }
        }
        return null;
      })();

      return await discovery;
    },
    createCommandEnv() {
      return getGitCommandEnv();
    },
  };
}
