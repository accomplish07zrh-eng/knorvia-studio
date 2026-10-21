// SPDX-License-Identifier: Apache-2.0
// 新运行时宿主：物化固定组合、调用 DSH 直接启动入口、持有唯一的 Cordis 根 Context。

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import { kernelPluginModuleIds } from "./builtins-modules.js";
import { type KernelMcpServerLike } from "./builtins-rows.js";
import { createKernelPluginRows } from "./composition.js";
import { KERNEL_DSH_VERSION } from "./constants.js";
import { prepareKernelEnvironment } from "./environment.js";
import {
  KernelAlreadyBootedError,
  KernelBootError,
  KernelConfigError,
  KernelDisposeError,
  errorMessage,
} from "./errors.js";
import { callKernelLogger, createStderrKernelLogger, type KernelLogger } from "./logger.js";
import { resolveDefaultModuleBaseUrl } from "./module-url.js";
import {
  type KernelUserEnvironmentSnapshot,
  createUserEnvironmentSnapshot,
} from "./user-environment.js";
import { provideUserEnvironment } from "./user-environment-service.js";

const CONFIG_DIRECTORY = "knorvia";
const CONFIG_FILE = "kernel.cordis.json";
const DISPOSE_TIMEOUT_MS = 5_000;

export interface BootKernelOptions {
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly dataRoot?: string;
  readonly moduleBaseUrl?: string;
  readonly logger?: KernelLogger;
  /** 启动时点的用户环境快照；不传则内部按 `process.env` 在清洗前建立（B9-B13）。 */
  readonly userEnvironment?: KernelUserEnvironmentSnapshot;
  /** Knorvia MCP 服务器配置；缺席表示不挂 MCP 客户端（B22）。 */
  readonly mcpServers?: Readonly<Record<string, KernelMcpServerLike>>;
}

export interface KernelHost {
  readonly engine: "dsh";
  readonly dshVersion: string;
  readonly dshHome: string;
  /** 本次启动的用户环境快照；工具子进程用它，且不含 DSH_*。 */
  readonly userEnvironment: KernelUserEnvironmentSnapshot;
  readonly context: Context;
  dispose(): Promise<void>;
}

let activeHostToken: symbol | undefined;

export async function bootKernel(options: BootKernelOptions): Promise<KernelHost> {
  if (activeHostToken !== undefined) throw new KernelAlreadyBootedError();
  const token = Symbol("knorvia-dsh-kernel");
  activeHostToken = token;

  const logger = options.logger ?? createStderrKernelLogger(process.stderr);

  try {
    // 修正一的前提：快照必须在 prepareKernelEnvironment 的进程级清洗之前拍下。
    // 这里读的是调用方给的环境（默认进程环境）当时的值，而不是清洗之后的值，
    // 所以用户自己的 *_API_KEY 会留在快照里（B10、B12）。
    const userEnvironment =
      options.userEnvironment ?? createUserEnvironmentSnapshot(options.env ?? process.env);

    const prepared = await prepareKernelEnvironment({
      cwd: options.cwd,
      env: options.env ?? process.env,
      dataRoot: options.dataRoot,
      logger,
    });

    const moduleIds = kernelPluginModuleIds();
    const rows = createKernelPluginRows(prepared.dshHome, {
      platform: process.platform,
      cwd: prepared.cwd,
      moduleIds,
      // 挂凭据 provider：不传这一项会让 `credentialRows` 恒为空，
      // 而 `llm-pi-ai` 的 `apiKeyEnv` 在服务缺席时静默回退到启动环境，
      // 那里已被进程级清洗删掉了所有 `*_API_KEY` —— 真实模型调用将无 key 可用。
      credentialProviderModuleId: moduleIds.credentials,
      ...(options.mcpServers === undefined ? {} : { mcpServers: options.mcpServers }),
    });
    const configPath = join(prepared.dshHome, CONFIG_DIRECTORY, CONFIG_FILE);
    try {
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(configPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    } catch (cause) {
      throw new KernelConfigError(
        `Failed to materialize kernel config at ${configPath}: ${errorMessage(cause)}`,
        { cause },
      );
    }
    callKernelLogger(logger, "info", "kernel.dsh.config.materialized", { path: configPath });
    callKernelLogger(logger, "debug", "kernel.dsh.rows", { ids: rows.map((row) => row.id) });
    // 只报条目数：快照可能含用户凭据形变量，键名与键值都不进日志（interface §二）。
    callKernelLogger(logger, "info", "kernel.env.snapshot", { entries: userEnvironment.size });
    callKernelLogger(logger, "info", `dsh.version=${KERNEL_DSH_VERSION}`);
    callKernelLogger(logger, "info", "kernel.dsh.platform", {
      platform: process.platform,
      arch: process.arch,
    });
    callKernelLogger(logger, "debug", "skills.providers=0");
    callKernelLogger(logger, "debug", "hooks.compat=disabled");
    callKernelLogger(logger, "info", "telemetry.composition=none");

    const moduleBaseUrl = options.moduleBaseUrl ?? resolveDefaultModuleBaseUrl();
    let context: Context;
    try {
      const { boot } = await import("@deepseek-ai/dsh-app-boot");
      // prepare 在配置树挂载前运行：把快照作为宿主服务提供给带快照的 shell 执行器。
      context = await boot(
        "knorvia",
        configPath,
        undefined,
        (bootContext: Context) => {
          provideUserEnvironment(bootContext, userEnvironment);
        },
        moduleBaseUrl,
      );
    } catch (cause) {
      throw new KernelBootError(`DSH boot failed: ${errorMessage(cause)}`, { cause });
    }

    let disposePromise: Promise<void> | undefined;
    return {
      engine: "dsh",
      dshVersion: KERNEL_DSH_VERSION,
      dshHome: prepared.dshHome,
      userEnvironment,
      context,
      dispose(): Promise<void> {
        disposePromise ??= disposeContext(context, logger).then(() => {
          if (activeHostToken === token) activeHostToken = undefined;
        });
        return disposePromise;
      },
    };
  } catch (error) {
    if (activeHostToken === token) activeHostToken = undefined;
    throw error;
  }
}

async function disposeContext(context: Context, logger: KernelLogger): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      context.fiber.dispose(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new KernelDisposeError(`Kernel dispose timed out after ${DISPOSE_TIMEOUT_MS}ms`),
            ),
          DISPOSE_TIMEOUT_MS,
        );
        timer.unref?.();
      }),
    ]);
  } catch (cause) {
    if (cause instanceof KernelDisposeError) {
      callKernelLogger(logger, "error", "kernel.dsh.dispose.timeout", {
        timeoutMs: DISPOSE_TIMEOUT_MS,
      });
      throw cause;
    }
    throw new KernelDisposeError(`Kernel dispose failed: ${errorMessage(cause)}`, { cause });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
