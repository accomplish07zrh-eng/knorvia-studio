// Frozen against inherited source. Every filesystem/home/provider port is synthetic.
import assert from "node:assert/strict";
import { join, resolve as resolvePath } from "node:path";
import { after, beforeEach, mock, test } from "node:test";
import type { TerminalDetectedProfile } from "../src/terminal/terminalProfileTypes.js";

const base = resolvePath("synthetic-terminal-profile-owned");
const home = join(base, "home");
const osHome = join(base, "os-home");
const app = join(base, "appdata");
const xdg = join(base, "xdg");
const local = join(base, "localappdata");
const fallbackNames = [
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
];
const fallback = fallbackNames.join(", ");
const vsPaths = [
  join(app, "Code", "User", "settings.json"),
  join(app, "Code - Insiders", "User", "settings.json"),
  join(xdg, "Code", "User", "settings.json"),
  join(xdg, "Code - Insiders", "User", "settings.json"),
  join(home, ".config", "Code", "User", "settings.json"),
  join(home, ".config", "Code - Insiders", "User", "settings.json"),
  join(home, "Library", "Application Support", "Code", "User", "settings.json"),
  join(home, "Library", "Application Support", "Code - Insiders", "User", "settings.json"),
];
const winPaths = [
  join(local, "Packages", "Microsoft.WindowsTerminal_8wekyb3d8bbwe", "LocalState", "settings.json"),
  join(
    local,
    "Packages",
    "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe",
    "LocalState",
    "settings.json",
  ),
  join(local, "Microsoft", "Windows Terminal", "settings.json"),
];
const kittyPaths = [
  join(xdg, "kitty", "kitty.conf"),
  join(home, "Library", "Application Support", "kitty", "kitty.conf"),
];
const alacrittyPaths = [
  join(xdg, "alacritty", "alacritty.toml"),
  join(home, ".alacritty.toml"),
  join(xdg, "alacritty", "alacritty.yml"),
  join(xdg, "alacritty", "alacritty.yaml"),
];
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const emitted = process.env.KNORVIA_TERMINAL_PROFILE_TARGET === "dist";
const macUrl = new URL(
  `../${emitted ? "dist" : "src"}/terminal/terminalProfileMacOs.${emitted ? "js" : "ts"}`,
  import.meta.url,
);

function setup() {
  return {
    files: new Map<string, string | Error>(),
    exists: [] as string[],
    reads: [] as string[],
    homeCalls: 0,
    existsError: undefined as unknown,
    macProfiles: {} as Record<string, TerminalDetectedProfile | null>,
    macError: undefined as unknown,
    macCalls: [] as string[],
    macEnvs: [] as NodeJS.ProcessEnv[],
    env: {
      HOME: home,
      USERPROFILE: join(base, "userprofile"),
      APPDATA: app,
      LOCALAPPDATA: local,
      XDG_CONFIG_HOME: xdg,
    } as NodeJS.ProcessEnv,
  };
}
let state = setup();
function platform(value: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { ...originalPlatform, value });
}
beforeEach(() => {
  state = setup();
  platform("linux");
});
after(() => Object.defineProperty(process, "platform", originalPlatform));

mock.module("node:fs", {
  namedExports: {
    existsSync: (path: string) => {
      state.exists.push(path);
      if (state.existsError !== undefined) throw state.existsError;
      return state.files.has(path);
    },
    readFileSync: (path: string, encoding: string) => {
      assert.equal(encoding, "utf8");
      state.reads.push(path);
      const value = state.files.get(path);
      if (value instanceof Error) throw value;
      assert.equal(typeof value, "string");
      return value;
    },
  },
});
mock.module("node:os", {
  namedExports: {
    homedir: () => {
      state.homeCalls++;
      return osHome;
    },
  },
});
mock.module(macUrl.href, {
  namedExports: {
    createMacOsTerminalProfileDetectors: () =>
      ["iterm2", "macos-terminal"].map((id) => ({
        id,
        platforms: ["darwin"],
        detect: (env: NodeJS.ProcessEnv) => {
          state.macCalls.push(id);
          state.macEnvs.push(env);
          if (state.macError !== undefined) throw state.macError;
          return state.macProfiles[id] ?? null;
        },
      })),
  },
});
const { resolveTerminalFontProfile: profile }: typeof import("../src/terminal/terminalProfile.js") =
  await import(
    new URL(
      `../${emitted ? "dist" : "src"}/terminal/terminalProfile.${emitted ? "js" : "ts"}`,
      import.meta.url,
    ).href
  );
function call(settings: Parameters<typeof profile>[0]["settings"] = {}, env = state.env) {
  return profile({ settings, env });
}
function vscode(path: string, font: unknown) {
  state.files.set(path, JSON.stringify({ "terminal.integrated.fontFamily": font }));
}
function chosen(font: string) {
  return {
    fontFamily: `${font}, ${fallback}`,
    fontSize: undefined,
    theme: undefined,
    source: "system",
  };
}

test("empty configurations preserve fallback shape and ordered eligible probes", () => {
  assert.deepEqual(call(), { fontFamily: fallback, source: "fallback" });
  assert.deepEqual(state.exists, [...vsPaths, ...kittyPaths, ...alacrittyPaths]);
  assert.deepEqual(state.reads, []);
  assert.deepEqual(state.macCalls, []);
});
test("disabled inheritance performs no IO, including when custom font is absent", () => {
  assert.deepEqual(call({ terminalInheritSystemProfile: false }), {
    fontFamily: fallback,
    source: "fallback",
  });
  assert.deepEqual(
    call({ terminalInheritSystemProfile: false, terminalFontFamily: "  Owned Mono  " }),
    {
      fontFamily: `Owned Mono, ${fallback}`,
      fontSize: undefined,
      theme: undefined,
      source: "custom",
    },
  );
  assert.deepEqual(state.exists, []);
  assert.deepEqual(state.macCalls, []);
  assert.equal(state.homeCalls, 0);
});
test("custom stacks retain duplicate primary names, exact case and fallback ordering", () => {
  const result = call({
    terminalFontFamily: " Menlo, Owned Mono, Menlo, monospace, menlo, , ",
    terminalInheritSystemProfile: false,
  });
  assert.equal(
    result.fontFamily,
    [
      "Menlo",
      "Owned Mono",
      "Menlo",
      "monospace",
      "menlo",
      ...fallbackNames.filter((name) => name !== "Menlo" && name !== "monospace"),
    ].join(", "),
  );
  assert.equal(result.source, "custom");
  assert.deepEqual(Object.keys(result), ["fontFamily", "fontSize", "theme", "source"]);
});
test("blank custom is absent and only literal false disables detection", () => {
  vscode(vsPaths[0]!, "Owned System");
  for (const flag of [undefined, true, null, 0, ""]) {
    assert.deepEqual(
      call({ terminalFontFamily: " \t ", terminalInheritSystemProfile: flag as boolean }),
      chosen("Owned System"),
    );
  }
});
for (let winner = 0; winner < vsPaths.length; winner++)
  test(`VS Code candidate ${winner + 1} wins before all later paths and detectors`, () => {
    for (let index = 0; index < winner; index++) state.files.set(vsPaths[index]!, "[]");
    vscode(vsPaths[winner]!, `VS ${winner}`);
    state.files.set(kittyPaths[0]!, "font_family Kitty Later");
    assert.deepEqual(call(), chosen(`VS ${winner}`));
    assert.deepEqual(state.exists, vsPaths.slice(0, winner + 1));
    assert.deepEqual(state.macCalls, []);
  });
test("terminal environment hints do not select a different detector", () => {
  Object.assign(state.env, {
    TERM_PROGRAM: "kitty",
    WT_SESSION: "synthetic",
    KITTY_WINDOW_ID: "1",
    ALACRITTY_LOG: "synthetic",
  });
  vscode(vsPaths[0]!, "VS First");
  state.files.set(kittyPaths[0]!, "font_family Kitty Second");
  assert.deepEqual(call(), chosen("VS First"));
});
for (const [label, env, expected, homes] of [
  ["HOME", { HOME: ` ${home} `, USERPROFILE: join(base, "ignored") }, home, 0],
  ["USERPROFILE", { HOME: " \t", USERPROFILE: ` ${home} ` }, home, 0],
  ["OS home", {}, osHome, 1],
] as const)
  test(`trimmed home resolution prioritizes ${label}`, () => {
    const path = join(expected, ".config", "Code", "User", "settings.json");
    vscode(path, "Home Mono");
    assert.deepEqual(call({}, env), chosen("Home Mono"));
    assert.equal(state.homeCalls, homes);
    assert.equal(state.exists[0], path);
  });
test("missing explicit home resolves independently for VS Code, Kitty and Alacritty", () => {
  assert.equal(call({}, {}).source, "fallback");
  assert.equal(state.homeCalls, 3);
});
test("relative roots are joined without expansion and duplicate candidates are retained", () => {
  const relative = "synthetic-terminal-profile-owned/relative/../relative";
  const env = { HOME: relative, APPDATA: relative, XDG_CONFIG_HOME: relative };
  assert.equal(call({}, env).source, "fallback");
  assert.deepEqual(state.exists.slice(0, 4), [
    join(relative, "Code", "User", "settings.json"),
    join(relative, "Code - Insiders", "User", "settings.json"),
    join(relative, "Code", "User", "settings.json"),
    join(relative, "Code - Insiders", "User", "settings.json"),
  ]);
  assert.equal(state.homeCalls, 0);
});
test("omitted environment uses current process environment without mutating it", (t) => {
  const keys = ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) process.env[key] = state.env[key];
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  vscode(vsPaths[0]!, "Process Mono");
  assert.deepEqual(profile({ settings: {} }), chosen("Process Mono"));
  for (const key of keys) assert.equal(process.env[key], state.env[key]);
});
for (let winner = 0; winner < winPaths.length; winner++)
  test(`Windows Terminal settings candidate ${winner + 1} precedes VS Code`, () => {
    platform("win32");
    for (let index = 0; index < winner; index++) state.files.set(winPaths[index]!, "invalid");
    state.files.set(
      winPaths[winner]!,
      JSON.stringify({ profiles: { defaults: { font: { face: `Win ${winner}` } } } }),
    );
    vscode(vsPaths[0]!, "VS Later");
    assert.deepEqual(call(), chosen(`Win ${winner}`));
    assert.deepEqual(state.exists, winPaths.slice(0, winner + 1));
  });
test("Windows default GUID, defaults and list precedence remain exact", () => {
  platform("win32");
  const list = [
    null,
    2,
    { guid: "g ", font: { face: "Wrong GUID" } },
    { guid: "g", font: { face: "Default Guid" } },
    { guid: "g", font: { face: "Later Guid" } },
  ];
  state.files.set(
    winPaths[0]!,
    JSON.stringify({
      defaultProfile: " g ",
      profiles: { defaults: { font: { face: "Defaults" } }, list },
    }),
  );
  assert.deepEqual(call(), chosen("Default Guid"));
  state.files.set(
    winPaths[0]!,
    JSON.stringify({
      defaultProfile: "missing",
      profiles: { defaults: { font: { face: " Defaults " } }, list },
    }),
  );
  assert.deepEqual(call(), chosen("Defaults"));
  state.files.set(
    winPaths[0]!,
    JSON.stringify({ profiles: { defaults: { font: { face: " " } }, list } }),
  );
  assert.deepEqual(call(), chosen("Wrong GUID"));
});
test("Windows APPDATA fallback trims the selected root and missing roots skip its candidates", () => {
  platform("win32");
  state.env.LOCALAPPDATA = " \t";
  state.env.APPDATA = ` ${app} `;
  const path = join(
    app,
    "Packages",
    "Microsoft.WindowsTerminal_8wekyb3d8bbwe",
    "LocalState",
    "settings.json",
  );
  state.files.set(path, '{"profiles":{"defaults":{"font":{"face":"App Win"}}}}');
  assert.deepEqual(call(), chosen("App Win"));
  assert.deepEqual(state.exists, [path]);
  state.exists.length = 0;
  assert.equal(call({}, { HOME: home }).source, "fallback");
  assert.deepEqual(state.exists, vsPaths.slice(4));
});
test("platform eligibility preserves portable BSD support and VS Code on other systems", () => {
  state.files.set(kittyPaths[0]!, "font_family Portable Kitty");
  for (const value of ["linux", "freebsd", "openbsd"] as const) {
    platform(value);
    assert.deepEqual(call(), chosen("Portable Kitty"));
  }
  for (const value of ["aix", "sunos", "win32"] as const) {
    platform(value);
    assert.equal(call().source, "fallback");
  }
  assert.deepEqual(state.macCalls, []);
});
test("Kitty first match, quote stripping and library fallback retain their grammar", () => {
  state.files.set(kittyPaths[0]!, '# synthetic\n font_family "Kitty One"\nfont_family Kitty Two');
  assert.deepEqual(call(), chosen("Kitty One"));
  state.files.set(kittyPaths[0]!, "no font");
  state.files.set(kittyPaths[1]!, "font_family Library Kitty");
  assert.deepEqual(call(), chosen("Library Kitty"));
  state.files.set(kittyPaths[0]!, "font_family \n font_family Later");
  assert.deepEqual(call(), chosen("font_family Later"));
});
test("Kitty quoted empty family ends that detector before Alacritty fallback", () => {
  state.files.set(kittyPaths[0]!, 'font_family ""');
  state.files.set(kittyPaths[1]!, "font_family Must Not Read");
  state.files.set(alacrittyPaths[0]!, '[font.normal]\nfamily="Alacritty After Empty"');
  assert.deepEqual(call(), chosen("Alacritty After Empty"));
  assert.ok(!state.exists.includes(kittyPaths[1]!));
});
for (let winner = 0; winner < alacrittyPaths.length; winner++)
  test(`Alacritty TOML/YAML candidate ${winner + 1} retains precedence and nested font parsing`, () => {
    for (let index = 0; index < winner; index++)
      state.files.set(alacrittyPaths[index]!, "font = [invalid");
    const text =
      winner < 2
        ? `[font.normal]\nfamily = " Alac ${winner} "`
        : `font:\n  normal:\n    family: " Alac ${winner} "`;
    state.files.set(alacrittyPaths[winner]!, text);
    assert.deepEqual(call(), chosen(`Alac ${winner}`));
    assert.deepEqual(state.exists, [
      ...vsPaths,
      ...kittyPaths,
      ...alacrittyPaths.slice(0, winner + 1),
    ]);
  });
test("structured parsers reject non-object roots and malformed/nonnumeric font leaves", () => {
  state.files.set(alacrittyPaths[0]!, "[font]\nnormal=42");
  state.files.set(alacrittyPaths[1]!, "[font.normal]\nfamily=12");
  state.files.set(alacrittyPaths[2]!, "- font:\n    normal:\n      family: ArrayFont");
  state.files.set(alacrittyPaths[3]!, 'font:\n  normal:\n    family: "Final YAML"');
  assert.deepEqual(call(), chosen("Final YAML"));
});
test("JSONC corpus preserves comment/string/escape/trailing-comma and rejection behavior", async (t) => {
  const cases: Array<[string, string, string | null]> = [
    ["literal dotted key", '{"terminal.integrated.fontFamily":"Literal"}', "Literal"],
    ["nested substitute rejected", '{"terminal":{"integrated":{"fontFamily":"Nested"}}}', null],
    [
      "comments and commas",
      '// synthetic\n{"terminal.integrated.fontFamily":"Commented",/* block */"other":[1,2,],}',
      "Commented",
    ],
    [
      "markers in strings",
      '{"terminal.integrated.fontFamily":"https://synthetic.test/*font*/"}',
      "https://synthetic.test/*font*/",
    ],
    [
      "escaped quote",
      '{"terminal.integrated.fontFamily":"Escaped \\"Family\\"" ,}',
      'Escaped "Family"',
    ],
    ["escaped slash", '{"terminal.integrated.fontFamily":"Path \\\\ Family",}', "Path \\ Family"],
    ["comma inside string", '{"terminal.integrated.fontFamily":"Alpha, Beta,}"}', "Alpha, Beta, }"],
    ["EOF comment", '{"terminal.integrated.fontFamily":"EOF"}// tail', "EOF"],
    [
      "unterminated block after object",
      '{"terminal.integrated.fontFamily":"Block"}/* tail',
      "Block",
    ],
    ["unterminated object", '{"terminal.integrated.fontFamily":"Missing"/* tail', null],
    ["double comma", '{"terminal.integrated.fontFamily":"Bad",,}', null],
    ["array root", '[{"terminal.integrated.fontFamily":"Array"}]', null],
    ["null root", "null", null],
    ["scalar root", "42", null],
    ["numeric font", '{"terminal.integrated.fontFamily":13}', null],
    ["blank font", '{"terminal.integrated.fontFamily":"  "}', null],
    ["single quotes rejected", "{'terminal.integrated.fontFamily':'Single'}", null],
  ];
  for (const [label, text, expected] of cases)
    await t.test(label, () => {
      state.files.set(vsPaths[0]!, text);
      state.files.set(kittyPaths[0]!, "font_family Corpus Fallback");
      assert.deepEqual(call(), chosen(expected ?? "Corpus Fallback"));
    });
});
test("read errors are candidate misses while existence errors retain their identity", () => {
  state.files.set(vsPaths[0]!, new Error("synthetic read denial"));
  vscode(vsPaths[1]!, "After Read Failure");
  assert.deepEqual(call(), chosen("After Read Failure"));
  const error = new Error("synthetic existence failure");
  state.existsError = error;
  assert.throws(
    () => call(),
    (value) => value === error,
  );
});
test("macOS handoff stays after VS Code, before Kitty and receives the same env", () => {
  platform("darwin");
  state.macProfiles["iterm2"] = { fontFamily: "Iterm Synthetic" };
  state.macProfiles["macos-terminal"] = { fontFamily: "Terminal Later" };
  state.files.set(kittyPaths[0]!, "font_family Kitty Later");
  assert.deepEqual(call(), chosen("Iterm Synthetic"));
  assert.deepEqual(state.exists, vsPaths);
  assert.deepEqual(state.macCalls, ["iterm2"]);
  assert.strictEqual(state.macEnvs[0], state.env);
});
test("theme-only and size-only provider profiles preserve values and reference identity", () => {
  platform("darwin");
  const theme = {
    background: "#102030",
    foreground: "#abcdef",
    cursor: "rgba(1, 2, 3, 0.5)",
    brightWhite: "#fefefe",
    selectionInactiveBackground: "transparent",
  };
  state.macProfiles["iterm2"] = { theme };
  const result = call();
  assert.deepEqual(result, { fontFamily: fallback, fontSize: undefined, theme, source: "system" });
  assert.strictEqual(result.theme, theme);
  state.macProfiles["iterm2"] = { fontFamily: "", fontSize: 0 };
  state.macProfiles["macos-terminal"] = { fontSize: 13.75 };
  assert.deepEqual(call(), {
    fontFamily: fallback,
    fontSize: 13.75,
    theme: undefined,
    source: "system",
  });
});
test("custom font still inherits provider size/theme and unexpected provider errors propagate", () => {
  platform("darwin");
  const theme = { background: "#112233" };
  state.macProfiles["iterm2"] = { fontFamily: "Provider", fontSize: 14.25, theme };
  assert.deepEqual(call({ terminalFontFamily: "Custom" }), {
    fontFamily: `Custom, ${fallback}`,
    fontSize: 14.25,
    theme,
    source: "custom",
  });
  const error = new Error("synthetic provider failure");
  state.macError = error;
  assert.throws(
    () => call({ terminalFontFamily: "Custom" }),
    (value) => value === error,
  );
});
test("every invocation observes changed configs without mutating inputs or provider data", () => {
  const envBefore = { ...state.env };
  const settings = { terminalFontFamily: " ", terminalInheritSystemProfile: true };
  vscode(vsPaths[0]!, "First Snapshot");
  assert.deepEqual(call(settings), chosen("First Snapshot"));
  vscode(vsPaths[0]!, "Second Snapshot");
  assert.deepEqual(call(settings), chosen("Second Snapshot"));
  assert.deepEqual(state.env, envBefore);
  assert.deepEqual(settings, { terminalFontFamily: " ", terminalInheritSystemProfile: true });
});
