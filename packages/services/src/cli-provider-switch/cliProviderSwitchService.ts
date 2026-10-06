import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  CLI_PROVIDER_SWITCH_PROTOCOLS,
  CLI_PROVIDER_SWITCH_TARGETS,
  isCliProviderSwitchTarget,
  type CliProviderSwitchApiType,
  type CliProviderSwitchApplyRequest,
  type CliProviderSwitchApplyResult,
  type CliProviderSwitchCandidate,
  type CliProviderSwitchStatus,
  type CliProviderSwitchTarget,
  type CliProviderSwitchView,
} from "@knorvia/shared";
import type { ProviderSettingsView } from "@knorvia/provider";
import { atomicWriteText } from "../fs/atomicFileUtils.js";
import { createServiceLogger } from "../logger/serviceLogger.js";
import type { ICliProviderSwitchService } from "./cliProviderSwitch.js";
import {
  CLI_TARGET_ADAPTERS,
  CliConfigParseError,
  type CliConnection,
  type CliRestoreSnapshot,
} from "./cliTargets.js";
import { TomlPatchError } from "./tomlPatch.js";

const logger = createServiceLogger("cli-provider-switch");

/** 切换记录不含密钥：只保存哈希，用来识别"仍是 Studio 写入的内容"和"供应商配置已变化"。 */
interface SwitchRecord {
  providerId: string;
  providerName: string;
  modelId: string;
  appliedAt: number;
  writtenHash: string;
  sourceHash: string;
  restore: CliRestoreSnapshot;
}
interface SwitchState {
  version: 1;
  records: Partial<Record<CliProviderSwitchTarget, SwitchRecord>>;
  backedUp: Partial<Record<CliProviderSwitchTarget, boolean>>;
}

interface ProviderConnection extends CliConnection {
  providerId: string;
  providerName: string;
}

export interface CliProviderSwitchDeps {
  providerSettings: { getView(): Promise<ProviderSettingsView> };
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
  now?: () => number;
}

class ConcurrentChangeError extends Error {}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function sourceHash(connection: CliConnection): string {
  return sha256([connection.apiType, connection.baseUrl, connection.apiKey, connection.modelId]);
}
function isApiType(value: unknown): value is CliProviderSwitchApiType {
  return (
    value === "anthropic-messages" ||
    value === "openai-chat-completions" ||
    value === "openai-responses"
  );
}
async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

/** 可执行、已启用且带 API Key 的个人或内置供应商模型；套餐登录类供应商没有可写入 CLI 的密钥。 */
function providerConnections(view: ProviderSettingsView): ProviderConnection[] {
  const result: ProviderConnection[] = [];
  for (const provider of view.providers) {
    if (!provider.enabled || !provider.executable) continue;
    const api = provider.effectiveConfig.api;
    const access = provider.effectiveConfig.access;
    const apiKey =
      access && (access.type === "api-key" || access.type === "zhipu-coding-plan-api-key")
        ? access.apiKey?.trim()
        : undefined;
    if (!api?.baseUrl?.trim() || !isApiType(api.type) || !apiKey) continue;
    const providerName = provider.providerName?.trim() || provider.providerId;
    for (const model of provider.models)
      if (model.enabled && model.executable)
        result.push({
          providerId: provider.providerId,
          providerName,
          modelId: model.modelId,
          apiType: api.type,
          baseUrl: api.baseUrl,
          apiKey,
          label: `Knorvia · ${providerName}`,
        });
  }
  return result;
}

export function createCliProviderSwitchService(
  deps: CliProviderSwitchDeps,
): ICliProviderSwitchService {
  const env = deps.env ?? process.env;
  const home = deps.home ?? homedir();
  const now = deps.now ?? Date.now;
  const root = join(deps.dataDir, "cli-switch");
  const statePath = join(root, "state.json");
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = queue.then(operation, operation);
    queue = next.catch(() => undefined);
    return next;
  };

  async function readState(): Promise<SwitchState> {
    try {
      const value = JSON.parse(await readText(statePath)) as SwitchState;
      if (value?.version === 1 && value.records && value.backedUp) return value;
    } catch {
      /* 缺失或损坏时从空记录开始；配置文件本身仍按内容判断状态。 */
    }
    return { version: 1, records: {}, backedUp: {} };
  }
  async function writeState(state: SwitchState): Promise<void> {
    await atomicWriteText(statePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  function status(
    cli: CliProviderSwitchTarget,
    text: string,
    record: SwitchRecord | undefined,
    connections: readonly ProviderConnection[],
  ): CliProviderSwitchStatus {
    const configPath = CLI_TARGET_ADAPTERS[cli].configPath(env, home);
    let inspection;
    try {
      inspection = CLI_TARGET_ADAPTERS[cli].inspect(text);
    } catch (error) {
      return { cli, configPath, state: "unreadable", error: (error as Error).message };
    }
    if (record && record.writtenHash === sha256(inspection.owned)) {
      const current = connections.find(
        (item) => item.providerId === record.providerId && item.modelId === record.modelId,
      );
      return {
        cli,
        configPath,
        state: "knorvia",
        active: {
          providerId: record.providerId,
          providerName: current?.providerName ?? record.providerName,
          modelId: record.modelId,
          appliedAt: record.appliedAt,
          stale: !current || sourceHash(current) !== record.sourceHash,
        },
      };
    }
    return { cli, configPath, state: inspection.routing ? "external" : "official" };
  }

  async function view(): Promise<CliProviderSwitchView> {
    const [state, providers] = await Promise.all([readState(), deps.providerSettings.getView()]);
    const connections = providerConnections(providers);
    const statuses = await Promise.all(
      CLI_PROVIDER_SWITCH_TARGETS.map(async (cli) =>
        status(
          cli,
          await readText(CLI_TARGET_ADAPTERS[cli].configPath(env, home)),
          state.records[cli],
          connections,
        ),
      ),
    );
    const candidates = Object.fromEntries(
      CLI_PROVIDER_SWITCH_TARGETS.map((cli) => [
        cli,
        connections
          .filter((item) => CLI_PROVIDER_SWITCH_PROTOCOLS[cli].includes(item.apiType))
          .map(
            (item): CliProviderSwitchCandidate => ({
              providerId: item.providerId,
              providerName: item.providerName,
              modelId: item.modelId,
              apiType: item.apiType,
            }),
          ),
      ]),
    ) as CliProviderSwitchView["candidates"];
    return { statuses, candidates };
  }

  /** 读取 → 计算 → 写临时文件 → 替换前复核原文件未被他人改动；改动则基于新内容重算。 */
  async function rewrite(
    cli: CliProviderSwitchTarget,
    state: SwitchState,
    transform: (text: string) => string,
  ): Promise<string> {
    const path = CLI_TARGET_ADAPTERS[cli].configPath(env, home);
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await readText(path);
      const output = transform(before);
      if (!state.backedUp[cli] && before) {
        const backups = join(root, "backups");
        await mkdir(backups, { recursive: true });
        await copyFile(path, join(backups, `${cli}-${now()}.bak`));
        state.backedUp[cli] = true;
      }
      try {
        await atomicWriteText(path, output, {
          // 锁文件会留在 CLI 的配置目录里，且 CLI 本身不认这把锁；改用替换前的内容复核。
          useFileLock: false,
          beforeRename: async () => {
            if ((await readText(path)) !== before) throw new ConcurrentChangeError();
          },
        });
      } catch (error) {
        if (error instanceof ConcurrentChangeError) continue;
        throw error;
      }
      // 文件里有明文密钥：收紧为仅当前用户可读写（Windows 由用户目录的访问控制保护）。
      if (process.platform !== "win32") await chmod(path, 0o600).catch(() => undefined);
      return output;
    }
    throw new Error("配置文件正在被其他程序频繁修改，Studio 未写入，请稍后重试");
  }

  async function apply(
    request: CliProviderSwitchApplyRequest,
  ): Promise<CliProviderSwitchApplyResult> {
    if (!isCliProviderSwitchTarget(request.cli)) throw new Error("不支持的 CLI");
    const cli = request.cli;
    const adapter = CLI_TARGET_ADAPTERS[cli];
    const [state, providers] = await Promise.all([readState(), deps.providerSettings.getView()]);
    const connections = providerConnections(providers);
    const current = status(
      cli,
      await readText(adapter.configPath(env, home)),
      state.records[cli],
      connections,
    );
    if (current.state === "unreadable") throw new Error(current.error ?? "配置文件无法解析");
    if (current.state === "external" && !request.takeOver)
      throw new Error("该 CLI 的配置被手动或其他工具修改过，请确认接管后再切换");
    const previous = state.records[cli];
    try {
      if (request.target.kind === "official") {
        const restore = previous?.restore ?? {};
        await rewrite(cli, state, (text) =>
          adapter.toOfficial(text, restore, current.state === "external"),
        );
        delete state.records[cli];
      } else {
        const { providerId, modelId } = request.target;
        const connection = connections.find(
          (item) => item.providerId === providerId && item.modelId === modelId,
        );
        if (!connection) throw new Error("所选模型不可用，请检查供应商配置与 API Key");
        if (!CLI_PROVIDER_SWITCH_PROTOCOLS[cli].includes(connection.apiType))
          throw new Error("该模型的接口协议与此 CLI 不兼容");
        // 只在从官方状态切走时记录用户原有模型字段；在 Knorvia 模型之间切换沿用最初的记录。
        let restore = previous?.restore;
        const written = await rewrite(cli, state, (text) => {
          restore ??= current.state === "official" ? adapter.inspect(text).restore : {};
          return adapter.toKnorvia(text, connection);
        });
        state.records[cli] = {
          providerId,
          providerName: connection.providerName,
          modelId,
          appliedAt: now(),
          writtenHash: sha256(adapter.inspect(written).owned),
          sourceHash: sourceHash(connection),
          restore: restore ?? {},
        };
      }
    } catch (error) {
      if (error instanceof TomlPatchError || error instanceof CliConfigParseError)
        throw new Error(error.message);
      throw error;
    }
    await writeState(state);
    logger.info("[cli-provider-switch] 已切换", { cli, target: request.target.kind });
    const after = await readText(adapter.configPath(env, home));
    return {
      status: status(cli, after, state.records[cli], connections),
      restartRequired:
        cli === "claude-code" && request.target.kind === "official" && previous
          ? "restart-running"
          : "new-sessions",
    };
  }

  return {
    getView: () => serial(view),
    apply: (request) => serial(() => apply(request)),
  };
}
