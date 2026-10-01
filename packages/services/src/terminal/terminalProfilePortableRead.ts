// The file group owns read attempts; its ports never write, execute, or log config text.
import { interpretTerminalProfile } from "./terminalProfilePortableFormats.js";
import type { TerminalProfileProbe } from "./terminalProfilePortablePlan.js";
import type { TerminalDetectedProfile } from "./terminalProfileTypes.js";

export function readTerminalProfileGroup(
  probes: readonly TerminalProfileProbe[],
  ports: {
    exists(path: string): boolean;
    readUtf8(path: string): string;
  },
): TerminalDetectedProfile | null {
  for (const probe of probes) {
    if (!ports.exists(probe.path)) continue;
    try {
      const profile = interpretTerminalProfile(probe.format, ports.readUtf8(probe.path));
      if (profile) return profile;
    } catch {
      // 文件读取/解析失败只跳过本候选；exists 与外部 detector 异常按冻结合同继续传播。
    }
  }
  return null;
}
