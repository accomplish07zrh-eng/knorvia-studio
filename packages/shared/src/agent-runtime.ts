export type KnorviaAgentBinaryKind = "native-binary";

export interface KnorviaAgentRuntimeDescriptor {
  binaryKind: KnorviaAgentBinaryKind;
  binaryEnvVar: string;
  bundledResourceDir: string;
  version: string;
  spawnArgs: string[];
  nativeConfigDir: string;
  nativeConfigFileName: string;
  missingBinaryMessage: string;
  resolveEntrySegments(platform: string): string[];
  /**
   * 桌面端把 agent 的 JS bundle（knorvia.cjs）打进 resources/knorvia，由 app 内置的 Electron Node runtime
   * （ELECTRON_RUN_AS_NODE）直接执行，避免再随包内置一份独立 Node 二进制。
   * 这里只放纯 JS 入口文件名，平台无关（与 resolveEntrySegments 的原生二进制路径平行）。
   */
  nodeBundleEntryFile: string;
  resolveNodeBundleSegments(): string[];
}

export function resolvePlatformBinaryName(binaryName: string, platform: string): string {
  return platform === "win32" ? `${binaryName}.exe` : binaryName;
}

export const KNORVIA_AGENT_RUNTIME: KnorviaAgentRuntimeDescriptor = {
  binaryKind: "native-binary",
  binaryEnvVar: "KNORVIA_AGENT_BINARY",
  bundledResourceDir: "knorvia",
  version: "0.13.3",
  spawnArgs: ["app-server", "--stdio"],
  nativeConfigDir: ".knorvia-studio/cli",
  nativeConfigFileName: "config.json",
  missingBinaryMessage:
    "[Knorvia Studio Agent] Agent binary 未找到，请设置 KNORVIA_AGENT_BINARY 或先准备 Knorvia Agent 运行时资源",
  resolveEntrySegments: (platform) => [resolvePlatformBinaryName("agent", platform)],
  nodeBundleEntryFile: "knorvia.cjs",
  resolveNodeBundleSegments() {
    return [this.nodeBundleEntryFile];
  },
};

export function getKnorviaAgentRuntime(): KnorviaAgentRuntimeDescriptor {
  return KNORVIA_AGENT_RUNTIME;
}
