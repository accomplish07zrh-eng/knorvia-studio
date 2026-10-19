// SPDX-License-Identifier: Apache-2.0
// 新运行时的环境准备：清洗继承环境、派生 DSH_HOME，并保证在任何 DSH 模块求值前完成。

import { mkdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import { KernelConfigError, KernelInvalidCwdError, errorMessage } from "./errors.js";
import { callKernelLogger, type KernelLogger } from "./logger.js";

const PROVIDER_KEY_NAMES: ReadonlySet<string> = new Set([
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "MISTRAL_API_KEY",
  "XAI_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "DASHSCOPE_API_KEY",
  "MOONSHOT_API_KEY",
  "ZHIPUAI_API_KEY",
  "ZAI_API_KEY",
  "BIGMODEL_API_KEY",
  "SILICONFLOW_API_KEY",
  "TOGETHER_API_KEY",
  "FIREWORKS_API_KEY",
  "COHERE_API_KEY",
  "PERPLEXITY_API_KEY",
]);

const DSH_PREFIX = "DSH_";
const API_KEY_SUFFIX = "_API_KEY";

export interface KernelEnvironment {
  readonly dataRoot: string;
  readonly dshHome: string;
}

function resolveDshHome(dataRoot: string): string {
  return join(resolve(dataRoot), "dsh");
}

/** 删除 DSH_*、供应商 key 与任意 *_API_KEY；返回删除数量，不返回键名。 */
function sanitizeProcessEnvironment(): number {
  const windows = process.platform === "win32";
  let removed = 0;
  for (const key of Object.keys(process.env)) {
    const normalized = windows ? key.toUpperCase() : key;
    if (
      normalized.startsWith(DSH_PREFIX) ||
      normalized.endsWith(API_KEY_SUFFIX) ||
      PROVIDER_KEY_NAMES.has(normalized)
    ) {
      delete process.env[key];
      removed += 1;
    }
  }
  return removed;
}

export async function prepareKernelEnvironment(options: {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly dataRoot?: string;
  readonly logger: KernelLogger;
}): Promise<KernelEnvironment> {
  if (!isAbsolute(options.cwd)) throw new KernelInvalidCwdError(options.cwd);

  const dataRoot =
    options.dataRoot === undefined
      ? resolveKnorviaDataRoot(options.env)
      : resolve(options.dataRoot);
  const dshHome = resolveDshHome(dataRoot);

  const removed = sanitizeProcessEnvironment();
  process.env.DSH_HOME = dshHome;
  process.env.DSH_TELEMETRY_DISABLED = "1";

  try {
    await mkdir(dshHome, { recursive: true });
  } catch (cause) {
    throw new KernelConfigError(`Failed to create DSH home at ${dshHome}: ${errorMessage(cause)}`, {
      cause,
    });
  }

  callKernelLogger(options.logger, "info", "kernel.env.sanitized", { removed });
  callKernelLogger(options.logger, "info", "kernel.dsh.home", { dshHome });
  return { dataRoot, dshHome };
}
