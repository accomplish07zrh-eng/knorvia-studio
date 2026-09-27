import type { PrepareKnorviaStorageOptions } from "@knorvia/bootstrap/storage-startup";
import type { RunContext } from "@knorvia/shared-types";
import { parseGlobalArgs } from "./arguments.js";
import { resolveCliCwd } from "./cwd.js";
import { prepareProtocolCommandEnv, type CliEnv } from "./env.js";

export async function runStoragePreparationCommand(
  context: RunContext,
  dependencies: {
    cwd?: () => string;
    env?: CliEnv;
    prepare?: (options: PrepareKnorviaStorageOptions) => Promise<void>;
  } = {},
): Promise<number> {
  try {
    const parsed = parseGlobalArgs(context.argv);
    const cwd = resolveCliCwd({
      cwd: dependencies.cwd ?? process.cwd,
      requestedCwd: parsed.values.cwd,
    });
    const env = prepareProtocolCommandEnv({ cwd, env: dependencies.env });
    const prepare =
      dependencies.prepare ??
      (await import("@knorvia/bootstrap/storage-startup")).prepareKnorviaStorage;
    await prepare({ cwd, env, input: context.stdin, output: context.stdout });
    return 0;
  } catch (error) {
    context.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
