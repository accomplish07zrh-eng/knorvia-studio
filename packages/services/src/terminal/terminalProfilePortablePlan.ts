// Source-exposed contract reconstruction; paths and detector order are compatibility facts.
import { join } from "node:path";
import type { TerminalDetectedProfile } from "./terminalProfileTypes.js";

export type TerminalProfileFormat = "windows-jsonc" | "vscode-jsonc" | "kitty" | "toml" | "yaml";
export interface TerminalProfileProbe {
  path: string;
  format: TerminalProfileFormat;
}
interface ExternalDetector {
  id: string;
  platforms?: readonly NodeJS.Platform[];
  detect(env: NodeJS.ProcessEnv): TerminalDetectedProfile | null;
}
export type TerminalProfileGroup =
  | { kind: "files"; probes: TerminalProfileProbe[] }
  | { kind: "external"; detector: ExternalDetector };

export function* terminalProfilePortablePlan(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homePort: () => string,
  external: readonly ExternalDetector[],
): Generator<TerminalProfileGroup> {
  const home = () => env.HOME?.trim() || env.USERPROFILE?.trim() || homePort();
  const probe = (path: string, format: TerminalProfileFormat): TerminalProfileProbe => ({
    path,
    format,
  });
  if (platform === "win32") {
    const root = env.LOCALAPPDATA?.trim() || env.APPDATA?.trim();
    if (root)
      yield {
        kind: "files",
        probes: [
          ...[
            "Microsoft.WindowsTerminal_8wekyb3d8bbwe",
            "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe",
          ].map((product) =>
            probe(join(root, "Packages", product, "LocalState", "settings.json"), "windows-jsonc"),
          ),
          probe(join(root, "Microsoft", "Windows Terminal", "settings.json"), "windows-jsonc"),
        ],
      };
  }
  const codeHome = home();
  const codeRoots = [
    env.APPDATA?.trim(),
    env.XDG_CONFIG_HOME?.trim(),
    join(codeHome, ".config"),
    join(codeHome, "Library", "Application Support"),
  ];
  yield {
    kind: "files",
    probes: codeRoots.flatMap((root) =>
      root
        ? ["Code", "Code - Insiders"].map((product) =>
            probe(join(root, product, "User", "settings.json"), "vscode-jsonc"),
          )
        : [],
    ),
  };
  for (const detector of external) {
    if (!detector.platforms || detector.platforms.includes(platform))
      yield { kind: "external", detector };
  }
  if (!["darwin", "linux", "freebsd", "openbsd"].includes(platform)) return;
  const kittyHome = home();
  yield {
    kind: "files",
    probes: [
      probe(
        join(env.XDG_CONFIG_HOME?.trim() || join(kittyHome, ".config"), "kitty", "kitty.conf"),
        "kitty",
      ),
      probe(join(kittyHome, "Library", "Application Support", "kitty", "kitty.conf"), "kitty"),
    ],
  };
  const alacrittyHome = home();
  const alacrittyConfig = join(
    env.XDG_CONFIG_HOME?.trim() || join(alacrittyHome, ".config"),
    "alacritty",
  );
  yield {
    kind: "files",
    probes: [
      probe(join(alacrittyConfig, "alacritty.toml"), "toml"),
      probe(join(alacrittyHome, ".alacritty.toml"), "toml"),
      probe(join(alacrittyConfig, "alacritty.yml"), "yaml"),
      probe(join(alacrittyConfig, "alacritty.yaml"), "yaml"),
    ],
  };
}
