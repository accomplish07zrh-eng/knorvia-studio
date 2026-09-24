import { mkdir, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { StudioKernelRegistry } from "../../app/ports.js";
import type {
  StudioKernelAdapter,
  StudioKernelConfig,
  StudioKernelId,
  StudioKernelStatus,
} from "../../kernelTypes.js";
import {
  errorText,
  EXTERNAL_KERNELS,
  isManagedKernel,
  kernelCapabilities,
  versionFrom,
  type ExternalKernel,
} from "../../domain/kernelPolicy.js";
import { captureVersion, ProtocolProcess } from "./processTransport.js";
import { ManagedKernels } from "./managedKernels.js";
import { runKernelProtocol } from "./kernelRun.js";
import { codexArgs, codexMessage, startCodex } from "./codexProtocol.js";
import { claudeArgs, claudeMessage, startClaude } from "./claudeProtocol.js";
import { grokArgs, grokMessage, startGrok } from "./grokProtocol.js";
import { inspectStudioKernelOptions } from "./modelOptions.js";
import { BUILTIN_KERNELS, BUILTIN_KERNEL_BY_ID, type KernelDescriptor } from "./acpCatalog.js";
import { inspectAcpManifests, loadAcpManifests } from "./acpManifest.js";
import { resolveExecutable, type KernelExecutable } from "./executable.js";
import { acpMessage, initializeAcp, startAcp } from "./acpProtocol.js";
import { antigravityArgs, antigravityMessage, startAntigravity } from "./antigravityProtocol.js";
import { createRemoteKernelAdapter, type RemoteStudioEnvironment } from "./remoteKernelBridge.js";
import { parseRemoteStudioKernelId } from "../../domain/remoteAgentIdentity.js";
import { remoteStudioKernelId } from "./remoteAgentIdentity.js";
import { inspectRemoteStudioKernels } from "./remoteKernelCatalog.js";
import { externalUpdatePlan, runExternalUpdate } from "./externalUpdate.js";
import { isolatedInspection } from "./isolatedInspection.js";

export function createStudioKernelRegistry(options: {
  dataDir: string;
  builtin: StudioKernelAdapter;
  remoteEnvironments?: () => RemoteStudioEnvironment[];
}): StudioKernelRegistry {
  const running = new Map<
    Promise<unknown>,
    { kernel: StudioKernelId; controller: AbortController }
  >();
  const management = new ManagedKernels(options.dataDir, (kernel) =>
    [...running.values()].some((value) => value.kernel === kernel),
  );
  const updatingExternal = new Set<AbortController>();
  const externalOperations = new Set<Promise<unknown>>();
  let disposed = false;
  let configurations: Partial<Record<StudioKernelId, StudioKernelConfig>> = {};
  async function descriptor(id: StudioKernelId): Promise<KernelDescriptor> {
    const known = BUILTIN_KERNEL_BY_ID.get(id as ExternalKernel);
    if (known) return known;
    if (!id.startsWith("acp:")) throw new Error("未知内核");
    const custom = (await loadAcpManifests(options.dataDir)).find((entry) => entry.id === id);
    if (!custom) throw new Error("此自定义 ACP 内核未登记或清单无效");
    return custom;
  }
  async function resolveKernel(
    kernel: ExternalKernel,
    info: KernelDescriptor,
    supplied?: string,
  ): Promise<KernelExecutable & { managed: boolean }> {
    if (info.customPath) {
      if (supplied?.trim() && supplied.trim() !== info.customPath)
        throw new Error("自定义 ACP 内核只能使用清单登记的程序路径");
      return { ...(await resolveExecutable(kernel, info.customPath, info)), managed: false };
    }
    return management.resolve(kernel, supplied);
  }
  function probe<T>(
    kernel: ExternalKernel,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (disposed) return Promise.reject(new Error("Studio 内核注册表已关闭"));
    const controller = new AbortController();
    const promise = Promise.resolve().then(async () => {
      controller.signal.throwIfAborted();
      const release = kernel.startsWith("acp:") ? undefined : await management.lease(kernel);
      try {
        controller.signal.throwIfAborted();
        const result = await operation(controller.signal);
        controller.signal.throwIfAborted();
        return result;
      } finally {
        await release?.();
      }
    });
    running.set(promise, { kernel, controller });
    const cleanup = () => running.delete(promise);
    promise.then(cleanup, cleanup);
    return promise;
  }
  async function inspectOne(
    info: KernelDescriptor,
    configuration?: StudioKernelConfig,
  ): Promise<StudioKernelStatus> {
    const kernel = info.id;
    const base = {
      id: kernel,
      displayName: info.displayName,
      management: info.management,
      capabilities: kernelCapabilities(kernel),
    };
    try {
      return await probe(kernel, async (signal) => {
        const executable = await resolveKernel(kernel, info, configuration?.executablePath);
        const isolation = await isolatedInspection(kernel);
        try {
          const version = versionFrom(await captureVersion(executable, signal, isolation));
          if (!version) throw new Error("CLI 没有返回可识别的版本号");
          let capabilities = base.capabilities;
          if (info.protocol === "acp") {
            if (!isolation) await mkdir(options.dataDir, { recursive: true });
            const rpc = new ProtocolProcess(
              executable,
              info.args,
              isolation?.cwd ?? options.dataDir,
              "acp",
              (message) => {
                if (message.id !== undefined && message.method)
                  rpc.reject(message.id, "发现阶段不执行工具");
              },
              isolation?.environment,
            );
            const abort = () => rpc.fail(new Error("ACP 探测已取消"));
            signal.addEventListener("abort", abort, { once: true });
            try {
              const initialized = await initializeAcp(
                rpc,
                kernel === "deepseek-harness" ? 45_000 : 25_000,
              );
              const native = initialized.agentCapabilities;
              const advertised =
                native && typeof native === "object" ? (native as Record<string, unknown>) : {};
              capabilities = {
                ...base.capabilities,
                resume:
                  advertised.loadSession === true ||
                  !!(
                    advertised.sessionCapabilities &&
                    typeof advertised.sessionCapabilities === "object" &&
                    (advertised.sessionCapabilities as Record<string, unknown>).resume
                  ),
                approval: true,
              };
            } finally {
              signal.removeEventListener("abort", abort);
              await rpc.close();
            }
          }
          return {
            ...base,
            capabilities,
            installed: true,
            version,
            executablePath: executable.path,
            origin: executable.managed ? ("managed" as const) : ("external" as const),
            ...(!executable.managed && !info.customPath
              ? { externalUpdate: (await externalUpdatePlan(kernel, executable))?.method }
              : {}),
          };
        } finally {
          await isolation?.close();
        }
      });
    } catch (error) {
      return { ...base, installed: false, origin: "missing", error: errorText(error) };
    }
  }
  const adapters = new Map<StudioKernelId, StudioKernelAdapter>();
  adapters.set("knorvia", options.builtin);
  function externalAdapter(kernel: ExternalKernel): StudioKernelAdapter {
    return {
      run(turn, sink, signal) {
        if (disposed)
          return Promise.resolve({
            status: "failed" as const,
            text: "",
            resultKnown: true,
            error: "Studio 内核注册表已关闭",
          });
        const controller = new AbortController();
        const forwardAbort = () => controller.abort();
        signal.addEventListener("abort", forwardAbort, { once: true });
        if (signal.aborted) controller.abort();
        let release: (() => Promise<void>) | undefined;
        const operation = (async () => {
          const info = await descriptor(kernel);
          return runKernelProtocol({
            kernel,
            turn,
            sink,
            signal: controller.signal,
            executable: async () => {
              if (turn.kernel !== kernel) throw new Error("内核与执行请求不一致");
              if (
                !isAbsolute(turn.workspacePath) ||
                !(await stat(turn.workspacePath)).isDirectory()
              )
                throw new Error("工作目录必须是存在的本地绝对目录");
              if (!kernel.startsWith("acp:")) release = await management.lease(kernel);
              return resolveKernel(kernel, info, turn.executablePath);
            },
            mode:
              info.protocol === "codex"
                ? "codex"
                : info.protocol === "claude"
                  ? "claude"
                  : info.protocol === "antigravity"
                    ? "antigravity"
                    : "acp",
            args:
              info.protocol === "codex"
                ? codexArgs()
                : info.protocol === "claude"
                  ? claudeArgs(turn)
                  : info.protocol === "grok"
                    ? grokArgs(turn)
                    : info.protocol === "antigravity"
                      ? antigravityArgs(turn)
                      : info.args,
            message:
              info.protocol === "codex"
                ? codexMessage
                : info.protocol === "claude"
                  ? claudeMessage
                  : info.protocol === "grok"
                    ? grokMessage
                    : info.protocol === "antigravity"
                      ? antigravityMessage
                      : acpMessage,
            start:
              info.protocol === "codex"
                ? startCodex
                : info.protocol === "claude"
                  ? startClaude
                  : info.protocol === "grok"
                    ? startGrok
                    : info.protocol === "antigravity"
                      ? startAntigravity
                      : startAcp,
            environment:
              info.protocol === "claude"
                ? { DISABLE_AUTOUPDATER: "1" }
                : info.protocol === "antigravity"
                  ? { AGY_CLI_DISABLE_AUTO_UPDATE: "true" }
                  : undefined,
          });
        })().catch((error: unknown) => ({
          status: controller.signal.aborted ? ("cancelled" as const) : ("failed" as const),
          text: "",
          resultKnown: true,
          error: errorText(error),
        }));
        const promise = operation.finally(() => release?.());
        running.set(promise, { kernel, controller });
        promise
          .finally(() => {
            signal.removeEventListener("abort", forwardAbort);
            running.delete(promise);
          })
          .catch(() => {});
        return promise;
      },
    };
  }
  for (const kernel of EXTERNAL_KERNELS) adapters.set(kernel, externalAdapter(kernel));
  return {
    remoteWorkspace(kernel) {
      const remote = parseRemoteStudioKernelId(kernel);
      return remote
        ? options
            .remoteEnvironments?.()
            .find((item) => remoteStudioKernelId(item.workspaceIdentity, remote.kernel) === kernel)
            ?.service
        : undefined;
    },
    adapter(kernel) {
      if (parseRemoteStudioKernelId(kernel))
        return createRemoteKernelAdapter(kernel, options.remoteEnvironments ?? (() => []));
      if (kernel.startsWith("acp:")) return externalAdapter(kernel as ExternalKernel);
      const adapter = adapters.get(kernel);
      if (!adapter) throw new Error("未知内核");
      return adapter;
    },
    async options({ kernel, workspacePath, config, model }) {
      const remote = parseRemoteStudioKernelId(kernel);
      if (remote) {
        const environment = options
          .remoteEnvironments?.()
          .find((item) => remoteStudioKernelId(item.workspaceIdentity, remote.kernel) === kernel);
        if (!environment) return { models: [], error: "远程 Agent 连接不可用" };
        return environment.service.kernelOptions({
          kernel: remote.kernel,
          workspacePath: environment.workspacePath,
          model,
        });
      }
      if (kernel === "knorvia") return { models: [] };
      try {
        const info = await descriptor(kernel);
        return await probe(info.id, async (signal) => {
          const cwd =
            workspacePath || join(options.dataDir, "model-probes", kernel.replace(":", "-"));
          if (!workspacePath) await mkdir(cwd, { recursive: true });
          if (!isAbsolute(cwd) || !(await stat(cwd)).isDirectory())
            throw new Error("工作目录必须是存在的本地绝对目录");
          const executable = await resolveKernel(info.id, info, config.executablePath);
          signal.throwIfAborted();
          return inspectStudioKernelOptions({
            kernel: info.id,
            executable,
            cwd,
            signal,
            descriptor: info,
            selectedModel: model,
          });
        });
      } catch (error) {
        return { models: [], error: errorText(error) };
      }
    },
    async inspect(configs) {
      configurations = configs;
      const custom = await inspectAcpManifests(options.dataDir);
      const remoteResults = await inspectRemoteStudioKernels(options.remoteEnvironments?.() ?? []);
      return [
        {
          id: "knorvia",
          displayName: "Knorvia",
          management: "studio",
          installed: true,
          origin: "builtin",
          capabilities: kernelCapabilities("knorvia"),
        },
        ...(await Promise.all(
          [...BUILTIN_KERNELS, ...custom.entries].map((info) => inspectOne(info, configs[info.id])),
        )),
        ...custom.rejected,
        ...remoteResults,
      ];
    },
    async manage(kernel, action) {
      if (parseRemoteStudioKernelId(kernel))
        throw new Error("远程 CLI 请在对应服务器的安装渠道管理");
      if (kernel === "knorvia") throw new Error("内置内核随 Studio 更新，无独立安装操作");
      if (action === "update-existing") {
        const info = await descriptor(kernel);
        if (info.customPath) throw new Error("自定义 ACP 安装来源未知，不能由 Studio 更新");
        const before = await inspectOne(info, configurations[kernel]);
        if (!before.installed || before.origin !== "external")
          throw new Error("仅能更新已检测到的本机原有安装");
        const executable = await resolveKernel(
          kernel as ExternalKernel,
          info,
          configurations[kernel]?.executablePath,
        );
        const plan = await externalUpdatePlan(kernel as ExternalKernel, executable);
        if (!plan || before.executablePath !== executable.path)
          throw new Error("无法确认此 CLI 的原安装来源，请使用原安装渠道更新");
        const controller = new AbortController();
        updatingExternal.add(controller);
        const operation = runExternalUpdate(plan, controller.signal);
        externalOperations.add(operation);
        try {
          await operation;
        } finally {
          updatingExternal.delete(controller);
          externalOperations.delete(operation);
        }
        const after = await inspectOne(info, configurations[kernel]);
        if (!after.installed)
          throw new Error(`原 CLI 更新程序已退出，但重新检测失败：${after.error ?? "安装不可用"}`);
        return after;
      }
      if (!isManagedKernel(kernel))
        throw new Error("此 CLI 使用已有本机安装，请在原 CLI 的安装渠道管理");
      await management.manage(kernel, action);
      return inspectOne(
        BUILTIN_KERNEL_BY_ID.get(kernel)!,
        action === "uninstall" ? configurations[kernel] : undefined,
      );
    },
    async dispose() {
      disposed = true;
      for (const entry of running.values()) entry.controller.abort();
      for (const controller of updatingExternal) controller.abort();
      await Promise.allSettled([...running.keys(), ...externalOperations, management.dispose()]);
    },
  };
}
