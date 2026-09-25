import { mkdir } from "node:fs/promises";
import type { StudioKernelStatus } from "../../kernelTypes.js";
import type { KernelDescriptor } from "./acpCatalog.js";
import type { KernelExecutable } from "./executable.js";
import { ProtocolProcess } from "./processTransport.js";
import { initializeAcp } from "./acpProtocol.js";

type Capabilities = StudioKernelStatus["capabilities"];

/** 发现阶段完成 ACP 握手，只读取原生声明的能力；握手期间拒绝任何工具请求。 */
export async function probeAcpCapabilities(options: {
  info: KernelDescriptor;
  executable: KernelExecutable;
  base: Capabilities;
  dataDir: string;
  isolation?: { cwd: string; environment?: NodeJS.ProcessEnv };
  signal: AbortSignal;
}): Promise<Capabilities> {
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
  const abort = () => rpc.fail(new Error("ACP 探测已取消"));
  signal.addEventListener("abort", abort, { once: true });
  try {
    const initialized = await initializeAcp(rpc, info.id === "deepseek-harness" ? 45_000 : 25_000);
    const native = initialized.agentCapabilities;
    const advertised =
      native && typeof native === "object" ? (native as Record<string, unknown>) : {};
    return {
      ...options.base,
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
