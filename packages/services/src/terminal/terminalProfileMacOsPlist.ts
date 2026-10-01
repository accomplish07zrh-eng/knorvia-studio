// Source-exposed reconstruction; IO limits and failure classification are frozen contracts.
export interface TerminalProfileMacOsPlistPorts {
  platform(): NodeJS.Platform;
  exists(path: string): boolean;
  convertJson(path: string): string;
}

export function readTerminalProfileMacOsPlist(
  path: string,
  ports: TerminalProfileMacOsPlistPorts,
): Record<string, unknown> | null {
  if (ports.platform() !== "darwin") return null;
  // Existence is admission, not conversion: its error must reach the caller.
  if (!ports.exists(path)) return null;
  try {
    const document: unknown = JSON.parse(ports.convertJson(path));
    return document !== null && typeof document === "object" && !Array.isArray(document)
      ? (document as Record<string, unknown>)
      : null;
  } catch {
    // macOS 配置是尽力继承来源；仅转换/解析失败静默跳过，不能吞掉准入或投影错误。
    return null;
  }
}
