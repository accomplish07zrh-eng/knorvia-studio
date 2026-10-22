import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SSHConfigAliasOption } from "@knorvia/shared";
import { declarations, readContexts } from "./ssh-alias/configuration.js";
import { fallbackOption, mergeQuery } from "./ssh-alias/fallback.js";
import { findSSH, mapWorkers, queryAlias } from "./ssh-alias/query.js";

/** 并发查询别名的上限（ssh -G 是外部进程，过多会拖慢启动）。 */
const QUERY_CONCURRENCY = 4;

/** 默认的 SSH 配置根目录（`~/.ssh`）。 */
function defaultSshRoot(): string {
  return join(homedir(), ".ssh");
}

/**
 * 从本地 SSH 配置列出可用的别名。
 *
 * 流程：
 * 1. 若 `~/.ssh` 不存在，直接返回空（避免无谓的读取与 ssh 调用）；
 * 2. 读取配置上下文（`~/.ssh/config` 及其 Include 展开）；
 * 3. 提取别名声明；
 * 4. 若找到 `ssh` 可执行文件，则对每个别名执行 `ssh -G` 拿到解析后的 hostname；
 * 5. 查询失败或没有 ssh 时，退回「从配置文本推断」的结果。
 *
 * 任何一步失败都退回上一层结果，不抛错 —— 列出别名是「尽力而为」的能力，
 * 配置损坏不应阻断终端启动。
 */
export async function listSSHConfigAliasesFromLocalConfig(): Promise<SSHConfigAliasOption[]> {
  const root = defaultSshRoot();
  if (!existsSync(root)) return [];

  let contexts;
  try {
    contexts = await readContexts(root);
  } catch {
    return [];
  }

  const declared = declarations(contexts);
  if (declared.length === 0) return [];

  const executable = findSSH();
  if (executable === null) {
    return declared.map((declaration) => fallbackOption(declaration, contexts));
  }

  return mapWorkers(declared, QUERY_CONCURRENCY, async (declaration) => {
    const fallback = fallbackOption(declaration, contexts);
    try {
      const output = await queryAlias(executable, root, declaration.alias);
      return mergeQuery(output, fallback);
    } catch {
      return fallback;
    }
  });
}
