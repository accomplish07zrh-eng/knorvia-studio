import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import type { StudioKernelId } from "../../kernelTypes.js";

/** ACP discovery for these CLIs must not read or modify the user's real profile. */
export async function isolatedInspection(id: StudioKernelId): Promise<
  | {
      cwd: string;
      environment: NodeJS.ProcessEnv;
      close(): Promise<void>;
    }
  | undefined
> {
  if (id !== "qoder-cn" && id !== "deepseek-harness") return;
  const cwd = await mkdtemp(join(tmpdir(), "knorvia-acp-inspect-"));
  const home = join(cwd, "home");
  await mkdir(home);
  return {
    cwd,
    environment: {
      HOME: home,
      USERPROFILE: home,
      APPDATA: join(home, "AppData", "Roaming"),
      LOCALAPPDATA: join(home, "AppData", "Local"),
      XDG_CONFIG_HOME: join(home, ".config"),
      DSH_HOME: join(home, ".dsh"),
      NPM_CONFIG_OFFLINE: "true",
      NO_COLOR: "1",
    },
    async close() {
      const target = await realpath(cwd);
      const base = await realpath(tmpdir());
      const inside = relative(base, target);
      if (
        !inside ||
        inside === ".." ||
        inside.startsWith("..\\") ||
        inside.startsWith("../") ||
        isAbsolute(inside)
      )
        throw new Error("ACP 探测临时目录越界");
      await rm(target, { recursive: true, force: true });
    },
  };
}
