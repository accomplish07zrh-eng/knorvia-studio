// SPDX-License-Identifier: Apache-2.0
// 新运行时宿主：物化固定组合、调用 DSH 直接启动入口、持有唯一的 Cordis 根 Context。

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
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

const CONFIG_DIRECTORY = "knorvia";
const CONFIG_FILE = "kernel.cordis.json";
const DISPOSE_TIMEOUT_MS = 5_000;

export interface BootKernelOptions {
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly dataRoot?: string;
  readonly moduleBaseUrl?: string;
  readonly logger?: KernelLogger;
}

export interface KernelHost {
  readonly engine: "dsh";
  readonly dshVersion: string;
  readonly dshHome: string;
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
    const prepared = await prepareKernelEnvironment({
      cwd: options.cwd,
      env: options.env ?? process.env,
      dataRoot: options.dataRoot,
      logger,
    });

    const rows = createKernelPluginRows(prepared.dshHome);
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
      context = await boot("knorvia", configPath, undefined, undefined, moduleBaseUrl);
    } catch (cause) {
      throw new KernelBootError(`DSH boot failed: ${errorMessage(cause)}`, { cause });
    }

    let disposePromise: Promise<void> | undefined;
    return {
      engine: "dsh",
      dshVersion: KERNEL_DSH_VERSION,
      dshHome: prepared.dshHome,
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
