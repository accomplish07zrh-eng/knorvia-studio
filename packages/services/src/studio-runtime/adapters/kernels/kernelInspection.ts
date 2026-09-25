import type { StudioKernelConfig, StudioKernelStatus } from "../../kernelTypes.js";
import {
  capabilityAssessment,
  errorText,
  kernelCapabilities,
  versionFrom,
  type ExternalKernel,
} from "../../domain/kernelPolicy.js";
import type { StudioCapabilitySet } from "../../domain/capabilityMatrix.js";
import type { KernelDescriptor } from "./acpCatalog.js";
import type { KernelExecutable } from "./executable.js";
import { captureVersion, ProtocolResponseError } from "./processTransport.js";
import { probeAcpCapabilities } from "./acpProbe.js";
import { externalUpdatePlan } from "./externalUpdate.js";
import { isolatedInspection } from "./isolatedInspection.js";
import {
  buildProbe,
  ProbeCache,
  ProbeError,
  probeCacheKey,
  probeInstalled,
  probeStageFailure,
  probeStageOk,
  probeStageSkipped,
  probeSummary,
  type ProbeCode,
  type ProbeStage,
  type ProbeStageResult,
} from "./probeResult.js";

/** 隔离探测的等价标记：临时 HOME 每次不同，但都是同版本的空配置目录。 */
const ISOLATED_MARKER = "<isolated>";

/** 定位段失败代码：抛错点位于本轮写入范围之外，先按既有文本归类，原文保留在 reason。 */
function locateFailureCode(closed: boolean, message: string): ProbeCode {
  if (closed) return "locate.registry-closed";
  if (/内核管理操作|运行任务|正在使用|租赁|lease/i.test(message))
    return "locate.manager-unavailable";
  if (/绝对文件路径/.test(message)) return "locate.path-invalid";
  if (/启动器/.test(message)) return "locate.launcher-unresolved";
  if (/未安装|指定路径无效/.test(message)) return "locate.missing";
  return "locate.failed";
}

export interface KernelInspectionDeps {
  dataDir: string;
  /** 注册表的在飞去重 + 运行租约包装；定位段失败会在这里变成拒绝。 */
  guarded<T>(kernel: ExternalKernel, operation: (signal: AbortSignal) => Promise<T>): Promise<T>;
  resolve(
    kernel: ExternalKernel,
    info: KernelDescriptor,
    supplied?: string,
  ): Promise<KernelExecutable & { managed: boolean }>;
  isDisposed(): boolean;
  /** 可注入的附加动作（默认取真实实现），用于验证清理/更新入口失败不会抹掉成功状态。 */
  isolation?: typeof isolatedInspection;
  updatePlan?: typeof externalUpdatePlan;
}

/**
 * 分层探测：locate → version → protocol → auth，每段独立捕获，前段证据不被后段失败抹掉。
 * 见 specs/knorvia-kernel-status.md；本模块只负责探测，不承担注册表生命周期。
 */
export function createKernelInspector(deps: KernelInspectionDeps) {
  // ACP 握手昂贵（DeepSeek Harness 首次隔离握手约 20 秒），只缓存成功的同版本握手结果。
  const protocolCache = new ProbeCache<{
    capabilities: StudioCapabilitySet;
    protocol: ProbeStageResult;
  }>();
  const isolationOf = deps.isolation ?? isolatedInspection;
  const updatePlan = deps.updatePlan ?? externalUpdatePlan;

  async function inspectOne(
    info: KernelDescriptor,
    configuration?: StudioKernelConfig,
    request: { refresh?: boolean } = {},
  ): Promise<StudioKernelStatus> {
    const kernel = info.id;
    const startedAt = Date.now();
    const stages: Partial<Record<ProbeStage, ProbeStageResult>> = {};
    const base = {
      id: kernel,
      displayName: info.displayName,
      management: info.management,
    };
    // 前段失败不抹掉已取得的证据：origin 只由定位段决定，version/executablePath 在定位成功后保留。
    let origin: StudioKernelStatus["origin"] = "missing";
    let executablePath: string | undefined;
    let version: string | undefined;
    let capabilities: StudioCapabilitySet = kernelCapabilities(kernel);
    let cachedProtocol = false;
    const finish = (extra: Partial<StudioKernelStatus> = {}): StudioKernelStatus => {
      const probe = buildProbe({ stages, startedAt, cached: cachedProtocol });
      const failure = probeSummary(probe);
      return {
        ...base,
        capabilities,
        installed: probeInstalled(probe),
        origin,
        probe,
        ...(version ? { version } : {}),
        ...(executablePath ? { executablePath } : {}),
        ...(failure?.result.reason ? { error: failure.result.reason } : {}),
        ...extra,
      };
    };
    try {
      return await deps.guarded(kernel, async (signal) => {
        const locateStartedAt = Date.now();
        const executable = await deps.resolve(kernel, info, configuration?.executablePath);
        const isolation = await isolationOf(kernel);
        stages.locate = probeStageOk("locate.ok", locateStartedAt);
        origin = executable.managed ? "managed" : "external";
        executablePath = executable.path;
        try {
          const versionStartedAt = Date.now();
          try {
            version = versionFrom(await captureVersion(executable, signal, isolation));
            if (!version) throw new ProbeError("version.unparsable", "CLI 没有返回可识别的版本号");
            stages.version = probeStageOk("version.ok", versionStartedAt);
          } catch (error) {
            stages.version = probeStageFailure({
              error,
              signal,
              startedAt: versionStartedAt,
              reason: errorText(error),
              fallback: "version.failed",
            });
          }
          capabilities = capabilityAssessment(kernel, version).capabilities;
          if (!version) return finish();
          // 账号段永不自动执行：只要定位与版本已完成就按规则记为 skipped；更早失败才是 stage.not-reached。
          // 握手成功只代表协议可用，不代表账号可用，也不代用户登录。
          stages.auth = probeStageSkipped(
            "auth.not-requested",
            "未请求账号核验；握手成功不代表账号可用，Studio 从不代登录",
            Date.now(),
          );
          if (info.protocol !== "acp") {
            stages.protocol = probeStageSkipped(
              "protocol.unavailable",
              "此内核不使用 ACP 协议",
              Date.now(),
            );
            return finish();
          }
          const protocolStartedAt = Date.now();
          // 隔离探测的临时 HOME 每次都是新目录，但等价性成立（同版本、空配置目录）：
          // 缓存键把隔离环境归一为 <isolated>，否则 qoder-cn / DeepSeek Harness 永远无法命中。
          const cacheKey = probeCacheKey({
            kernel,
            executablePath: executable.path,
            version,
            environment: isolation
              ? {
                  ...process.env,
                  ...isolation.environment,
                  HOME: ISOLATED_MARKER,
                  USERPROFILE: ISOLATED_MARKER,
                  APPDATA: ISOLATED_MARKER,
                  LOCALAPPDATA: ISOLATED_MARKER,
                  DSH_HOME: ISOLATED_MARKER,
                }
              : { ...process.env },
            workspaceIdentity: isolation ? ISOLATED_MARKER : deps.dataDir,
          });
          const cached = request.refresh ? undefined : protocolCache.read(cacheKey);
          if (cached) {
            stages.protocol = cached.protocol;
            capabilities = cached.capabilities;
            cachedProtocol = true;
          } else {
            try {
              capabilities = await probeAcpCapabilities({
                info,
                executable,
                base: capabilityAssessment(kernel, version),
                dataDir: deps.dataDir,
                isolation,
                signal,
              });
              stages.protocol = probeStageOk("protocol.ok", protocolStartedAt);
              // 只缓存成功结果；失败、取消、超时都不固化，避免把瞬时故障当成事实。
              protocolCache.write(cacheKey, { capabilities, protocol: stages.protocol });
            } catch (error) {
              stages.protocol = probeStageFailure({
                error,
                signal,
                startedAt: protocolStartedAt,
                reason: errorText(error),
                fallback:
                  error instanceof ProtocolResponseError ? "protocol.rpc" : "protocol.transport",
              });
              return finish();
            }
          }
          let externalUpdate: StudioKernelStatus["externalUpdate"];
          if (!executable.managed && !info.customPath) {
            // 更新入口只是附加信息：解析失败必须保留已经成立的成功状态。
            try {
              externalUpdate = (await updatePlan(kernel, executable))?.method;
            } catch {
              /* 非致命：不改变 installed/origin/version */
            }
          }
          return finish(externalUpdate ? { externalUpdate } : {});
        } finally {
          try {
            await isolation?.close();
          } catch {
            /* 隔离目录清理失败同样只记录，不覆盖成功状态 */
          }
        }
      });
    } catch (error) {
      // 注册表关闭、运行租约、路径/收据解析失败在包装层拒绝时到达这里（定位段还没写结果）。
      if (!stages.locate) {
        const reason = errorText(error);
        stages.locate = probeStageFailure({
          error,
          startedAt,
          reason,
          fallback: locateFailureCode(deps.isDisposed(), reason),
        });
      }
      return finish();
    }
  }

  return {
    inspectOne,
    /** manage/dispose 必须失效缓存：安装副本或版本可能已经变化。 */
    invalidate: () => protocolCache.clear(),
  };
}
