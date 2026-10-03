// Source-exposed reconstruction; retained public shape/values are recorded in the scoped receipt.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { AppSettings } from "@knorvia/shared";
import { createMacOsTerminalProfileDetectors } from "./terminalProfileMacOs.js";
import { terminalProfilePortablePlan } from "./terminalProfilePortablePlan.js";
import { readTerminalProfileGroup } from "./terminalProfilePortableRead.js";
import type {
  TerminalDetectedProfile,
  TerminalFontFamilySource,
  TerminalThemeProfile,
} from "./terminalProfileTypes.js";
export type { TerminalFontFamilySource, TerminalThemeProfile } from "./terminalProfileTypes.js";

interface TerminalFontProfile {
  fontFamily: string;
  fontSize?: number;
  theme?: TerminalThemeProfile;
  source: TerminalFontFamilySource;
}
interface TerminalFontProfileInput {
  settings: Pick<AppSettings, "terminalFontFamily" | "terminalInheritSystemProfile">;
  env?: NodeJS.ProcessEnv;
}
const fallbackFamilies = [
  "ui-monospace",
  "SFMono-Regular",
  "SF Mono",
  "Menlo",
  "Monaco",
  "Consolas",
  "Cascadia Mono",
  "JetBrains Mono",
  "MesloLGS NF",
  "Hack Nerd Font",
  "Noto Sans Mono CJK SC",
  "monospace",
] as const;
const externalDetectors = createMacOsTerminalProfileDetectors();
const readPorts = { exists: existsSync, readUtf8: (path: string) => readFileSync(path, "utf8") };

function familyStack(primary: string): string {
  const names = primary.split(",").flatMap((part) => (part.trim() ? [part.trim()] : []));
  const present = new Set(names);
  return [...names, ...fallbackFamilies.filter((family) => !present.has(family))].join(", ");
}

export function resolveTerminalFontProfile(input: TerminalFontProfileInput): TerminalFontProfile {
  const env = input.env ?? process.env;
  const custom = input.settings.terminalFontFamily?.trim();
  let selected: TerminalDetectedProfile | null = null;
  if (input.settings.terminalInheritSystemProfile !== false) {
    for (const group of terminalProfilePortablePlan(
      env,
      process.platform,
      homedir,
      externalDetectors,
    )) {
      const candidate =
        group.kind === "external"
          ? group.detector.detect(env)
          : readTerminalProfileGroup(group.probes, readPorts);
      if (candidate?.fontFamily || candidate?.fontSize || candidate?.theme) {
        selected = candidate;
        break;
      }
    }
  }
  if (!custom && !selected) return { fontFamily: fallbackFamilies.join(", "), source: "fallback" };
  return {
    fontFamily: familyStack(custom || selected?.fontFamily || fallbackFamilies[0]),
    fontSize: selected?.fontSize,
    theme: selected?.theme,
    source: custom ? "custom" : "system",
  };
}
