import { mkdir } from "node:fs/promises";
import {
  mergeAdvertisedCapabilities,
  type StudioCapabilityAssessment,
  type StudioCapabilitySet,
} from "../../domain/capabilityMatrix.js";
import type { KernelDescriptor } from "./acpCatalog.js";
import type { KernelExecutable } from "./executable.js";
import { ProtocolProcess } from "./processTransport.js";
import { ProbeError } from "./probeResult.js";
import { initializeAcp } from "./acpProtocol.js";

/**
 * 发现阶段完成 ACP 握手，只读取原生声明的能力；握手期间拒绝任何工具请求。
 *
 * 原生声明只允许通过能力矩阵升级 `resume` 与 `approval`；readOnly/fullAccess/questions
 * 永不由声明升级（见 specs/knorvia-kernel-status.md）。
 */
export async function probeAcpCapabilities(options: {
  info: KernelDescriptor;
  executable: KernelExecutable;
  base: StudioCapabilityAssessment;
  dataDir: string;
  isolation?: { cwd: string; environment?: NodeJS.ProcessEnv };
  signal: AbortSignal;
}): Promise<StudioCapabilitySet> {
  const { info, executable, isolation, signal } = options;
  if (!isolation) await mkdir(options.dataDir, { recursive: true });
  const rpc = new ProtocolProcess(
    executable,
    info.args,
    isolation?.cwd ?? options.dataDir,
    "acp",
    (message) => {
      if (message.id !== undefined && message.method) rpc.reject(message.id, "发现阶段不执行工具");
    },
    isolation?.environment,
  );
  const abort = () => rpc.fail(new ProbeError("protocol.cancelled", "ACP 探测已取消"));
  signal.addEventListener("abort", abort, { once: true });
  try {
    const initialized = await initializeAcp(rpc, info.id === "deepseek-harness" ? 45_000 : 25_000);
    const native = initialized.agentCapabilities;
    const advertised =
      native && typeof native === "object" ? (native as Record<string, unknown>) : {};
    return mergeAdvertisedCapabilities(
      options.base,
      {
        resume:
          advertised.loadSession === true ||
          !!(
            advertised.sessionCapabilities &&
            typeof advertised.sessionCapabilities === "object" &&
            (advertised.sessionCapabilities as Record<string, unknown>).resume
          ),
        approval: true,
      },
      "acp-initialize",
    ).capabilities;
  } finally {
    signal.removeEventListener("abort", abort);
    await rpc.close();
  }
}
