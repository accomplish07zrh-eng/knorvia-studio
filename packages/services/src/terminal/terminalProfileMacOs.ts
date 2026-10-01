// Source-exposed reconstruction; retained factory shape and app/IO facts are recorded in the receipt.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  decodeTerminalProfileMacOs,
  type TerminalProfileMacOsApp,
} from "./terminalProfileMacOsDecode.js";
import {
  readTerminalProfileMacOsPlist,
  type TerminalProfileMacOsPlistPorts,
} from "./terminalProfileMacOsPlist.js";
import type { TerminalDetectedProfile } from "./terminalProfileTypes.js";

type TerminalProfileDetector = {
  id: string;
  platforms?: readonly NodeJS.Platform[];
  detect: (env: NodeJS.ProcessEnv) => TerminalDetectedProfile | null;
};
const plistPorts: TerminalProfileMacOsPlistPorts = {
  platform: () => process.platform,
  exists: existsSync,
  convertJson: (path) =>
    execFileSync("plutil", ["-convert", "json", "-o", "-", path], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 2_000,
      maxBuffer: 2 * 1024 * 1024,
    }),
};
const applications: ReadonlyArray<readonly [TerminalProfileMacOsApp, string]> = [
  ["iterm2", "com.googlecode.iterm2.plist"],
  ["macos-terminal", "com.apple.Terminal.plist"],
];
export function createMacOsTerminalProfileDetectors(): readonly TerminalProfileDetector[] {
  return applications.map(([app, preferences]) => ({
    id: app,
    platforms: ["darwin"],
    detect(env) {
      const home = env.HOME?.trim() || env.USERPROFILE?.trim() || homedir();
      const path = join(home, "Library", "Preferences", preferences);
      return decodeTerminalProfileMacOs(readTerminalProfileMacOsPlist(path, plistPorts), app);
    },
  }));
}
