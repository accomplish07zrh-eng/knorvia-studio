import type { SSHConfigAliasOption } from "@knorvia/shared";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { declarations, readContexts } from "./ssh-alias/configuration.js";
import { fallbackOption, mergeQuery } from "./ssh-alias/fallback.js";
import { findSSH, mapWorkers, queryAlias } from "./ssh-alias/query.js";

let cache: { expiresAt: number; options: SSHConfigAliasOption[] } | null = null;

export async function listSSHConfigAliasesFromLocalConfig(): Promise<SSHConfigAliasOption[]> {
  const now = Date.now();
  if (cache !== null && cache.expiresAt > now) {
    return cache.options.map((option) => ({ ...option }));
  }
  const root = join(homedir(), ".ssh", "config");
  if (!existsSync(root)) {
    cache = { expiresAt: now + 30000, options: [] };
    return [];
  }
  const contexts = await readContexts(root);
  const aliases = declarations(contexts);
  if (aliases.length === 0) {
    cache = { expiresAt: now + 30000, options: [] };
    return [];
  }
  const fallback = aliases.map((alias) => fallbackOption(alias, contexts));
  const executable = findSSH();
  const options =
    executable === null
      ? fallback
      : await mapWorkers(fallback, 3, async (option) => {
          const output = await queryAlias(executable, root, option.alias);
          return mergeQuery(output, option);
        });
  cache = { expiresAt: now + 30000, options };
  return options.map((option) => ({ ...option }));
}
