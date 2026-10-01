// Source-exposed partial reconstruction: launch planning and lifecycle; native load/helper routines retained.
import { accessSync, chmodSync, constants, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, release } from "node:os";
import { dirname, resolve } from "node:path";
import type { Event } from "@knorvia/rpc";
import type { IPty } from "node-pty";
import type { ISettingService } from "../setting/setting.js";
import type { ITerminalService, TerminalWindowsPtyInfo } from "./terminal.js";
import {
  resolveTerminalFontProfile,
  type TerminalFontFamilySource,
  type TerminalThemeProfile,
} from "./terminalProfile.js";
import { registerMemoryDiagnosticsProvider } from "#src/memoryDiagnostics.js";
import { TerminalServiceInstanceOwner } from "./terminalServiceInstanceOwner.js";
import {
  terminalShellPlan,
  terminalShellPlanFailure,
  terminalWorkingDirectoryPlan,
  terminalEnvironmentPlan,
  terminalPtyOptionPlan,
  terminalConptyDllMiss,
  terminalWindowsPtyPlan,
  type TerminalLaunchCandidate,
} from "./terminalServiceLaunchPlan.js";

const require = createRequire(import.meta.url);
type NodePtyModule = typeof import("node-pty");
type PtySpawnOptions = Parameters<NodePtyModule["spawn"]>[2];

let hasEnsuredNodePtyHelper = false;
let nodePtyModulePromise: Promise<NodePtyModule> | null = null;

async function loadNodePtyModule(): Promise<NodePtyModule> {
  if (!nodePtyModulePromise) {
    nodePtyModulePromise = import("node-pty").catch((error: unknown) => {
      nodePtyModulePromise = null;
      const message = error instanceof Error ? error.message : String(error);
      // remote server 启动时会先创建所有服务，之前这里顶层 import node-pty，
      // 只要当前平台缺少 pty.node，就会在服务注册阶段直接崩掉，整条远程连接链路都失败。
      // 改成延迟加载后，server 可以先完成握手，仅在真正创建终端时再暴露“terminal 不可用”的错误。
      throw new Error(`node-pty is unavailable in this runtime: ${message}`);
    }) as Promise<NodePtyModule>;
  }

  return nodePtyModulePromise;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveNodePtySpawnHelperPath(): string | null {
  if (process.platform !== "darwin") return null;

  try {
    const utils = require("node-pty/lib/utils") as {
      loadNativeModule(name: string): { dir: string };
    };
    const native = utils.loadNativeModule("pty");
    const unixTerminalPath = require.resolve("node-pty/lib/unixTerminal.js");

    let helperPath = resolve(dirname(unixTerminalPath), `${native.dir}/spawn-helper`);
    helperPath = helperPath.replace("app.asar", "app.asar.unpacked");
    helperPath = helperPath.replace("node_modules.asar", "node_modules.asar.unpacked");
    return helperPath;
  } catch {
    return null;
  }
}

function ensureNodePtySpawnHelperExecutable(): void {
  if (hasEnsuredNodePtyHelper || process.platform !== "darwin") return;
  hasEnsuredNodePtyHelper = true;

  const helperPath = resolveNodePtySpawnHelperPath();
  if (!helperPath || !existsSync(helperPath)) return;

  try {
    accessSync(helperPath, constants.X_OK);
    return;
  } catch {
    // 当前环境里的 node-pty spawn-helper 丢了执行权限，
    // child_process.spawn 还能工作，但 node-pty 在 macOS 上启动伪终端时会先调用这个 helper，
    // helper 不可执行就会直接报 posix_spawnp failed。
    // 这里在真正 spawn 前把 helper 修正为 0755，避免终端因为安装产物权限漂移而无法打开。
  }

  try {
    chmodSync(helperPath, 0o755);
    accessSync(helperPath, constants.X_OK);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`node-pty spawn-helper is not executable: ${helperPath}. ${message}`);
  }
}

function selectTerminalLaunchCandidate(
  candidates: Iterable<TerminalLaunchCandidate>,
  admit: (path: string) => boolean,
  failure: string,
): string {
  for (const candidate of candidates) {
    try {
      for (const path of candidate.paths) {
        try {
          if (admit(path)) return candidate.value;
        } catch {
          // 启动候选的探测失败只跳过当前路径，保持原有回退顺序与失败文案。
        }
      }
    } catch {
      // 既有可执行校验也将 PATH 枚举/路径构造失败视为当前 shell 候选未命中。
    }
  }
  throw new Error(failure);
}

function spawnTerminalProcess(params: {
  nodePty: NodePtyModule;
  shell: string;
  cols: number;
  rows: number;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): IPty {
  const { nodePty, shell, cols, rows, cwd, env } = params;
  const choices: readonly [PtySpawnOptions, PtySpawnOptions?] = terminalPtyOptionPlan(
    process.platform,
    { cols, rows, cwd, env },
  );
  const [preferred, fallback] = choices;
  if (!fallback) return nodePty.spawn(shell, [], preferred);
  try {
    return nodePty.spawn(shell, [], preferred);
  } catch (error) {
    if (!terminalConptyDllMiss(getErrorMessage(error))) throw error;
    // 仅 DLL 定位失败使用计划中的系统 ConPTY 候选；普通启动失败仍直接交给既有包装边界。
    return nodePty.spawn(shell, [], fallback);
  }
}

export function createTerminalService(dependencies: {
  settingService: ISettingService;
}): ITerminalService {
  const instances = new TerminalServiceInstanceOwner((read) =>
    registerMemoryDiagnosticsProvider("terminal", read),
  );

  const service: ITerminalService & { disposeAll(): void } = {
    async create(params: { cols: number; rows: number; cwd?: string }): Promise<{
      id: string;
      shell: string;
      fontFamily: string;
      fontSize?: number;
      theme?: TerminalThemeProfile;
      fontFamilySource: TerminalFontFamilySource;
      windowsPty?: TerminalWindowsPtyInfo;
    }> {
      const reservation = instances.reserve();
      const { id } = reservation;
      try {
        const shell = selectTerminalLaunchCandidate(
          terminalShellPlan(process.platform, process.env),
          (path) => {
            accessSync(path, constants.X_OK);
            return true;
          },
          terminalShellPlanFailure(process.platform),
        );
        const cwd = selectTerminalLaunchCandidate(
          terminalWorkingDirectoryPlan(params.cwd, process.env.HOME, homedir()),
          (path) => statSync(path).isDirectory(),
          "No usable working directory found for terminal startup",
        );
        const env = terminalEnvironmentPlan(process.platform, process.env);
        instances.assertCreating(reservation);
        const terminalProfileSettings = await dependencies.settingService.get().catch(() => ({
          terminalFontFamily: undefined,
          terminalInheritSystemProfile: true,
        }));
        instances.assertCreating(reservation);
        const fontProfile = resolveTerminalFontProfile({
          settings: terminalProfileSettings,
          env: process.env,
        });
        const nodePty = await loadNodePtyModule();
        instances.assertCreating(reservation);
        ensureNodePtySpawnHelperExecutable();
        instances.prepare(reservation);

        let p: IPty;
        try {
          p = spawnTerminalProcess({
            nodePty,
            shell,
            cols: params.cols,
            rows: params.rows,
            cwd,
            env,
          });
        } catch (error) {
          throw new Error(
            `Failed to start terminal with shell '${shell}' in '${cwd}': ${getErrorMessage(error)}`,
          );
        }

        instances.attach(reservation, p);
        const result = {
          id,
          shell,
          fontFamily: fontProfile.fontFamily,
          fontSize: fontProfile.fontSize,
          theme: fontProfile.theme,
          fontFamilySource: fontProfile.source,
          windowsPty: terminalWindowsPtyPlan(process.platform, release()),
        };
        instances.publish(reservation);
        return result;
      } catch (error) {
        return instances.fail(reservation, error);
      }
    },

    async write(params: { id: string; data: string }): Promise<void> {
      instances.write(params);
    },

    async resize(params: { id: string; cols: number; rows: number }): Promise<void> {
      instances.resize(params);
    },

    async dispose(params: { id: string }): Promise<void> {
      instances.dispose(params.id);
    },

    onDynamicData(id: string): Event<string> {
      return instances.dataEvent(id);
    },

    onDynamicExit(id: string): Event<number> {
      return instances.exitEvent(id);
    },

    disposeAll(): void {
      instances.disposeAll();
    },
  };

  return service;
}
