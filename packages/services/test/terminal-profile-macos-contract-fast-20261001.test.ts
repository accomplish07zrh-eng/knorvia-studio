// Frozen inherited contracts. Virtual owned fixtures; no filesystem or process execution.
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { after, beforeEach, mock, test } from "node:test";
import type { TerminalDetectedProfile } from "../src/terminal/terminalProfileTypes.js";

const emitted = process.env.KNORVIA_TERMINAL_MACOS_TARGET === "dist";
const root = resolve("synthetic-terminal-macos-owned");
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const itermPath = (home = root) =>
  join(home, "Library", "Preferences", "com.googlecode.iterm2.plist");
const terminalPath = (home = root) =>
  join(home, "Library", "Preferences", "com.apple.Terminal.plist");
let files: Map<string, string | Error>;
let existence: string[];
let commands: string[];
let existenceError: Error | undefined;
let homeCalls: number;
let commandAssertions: number;
beforeEach(() => {
  Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
  files = new Map();
  existence = [];
  commands = [];
  existenceError = undefined;
  homeCalls = 0;
  commandAssertions = 0;
});
after(() => Object.defineProperty(process, "platform", platform));
mock.module("node:fs", {
  namedExports: {
    existsSync: (path: string) => {
      existence.push(path);
      if (existenceError) throw existenceError;
      return files.has(path);
    },
    readFileSync: () => assert.fail("plist acceptance must not read real files"),
    chmodSync: () => assert.fail("no permission changes"),
  },
});
mock.module("node:os", {
  namedExports: {
    homedir: () => {
      homeCalls++;
      return root;
    },
  },
});
mock.module("node:child_process", {
  namedExports: {
    execFileSync: (executable: string, args: string[], options: unknown) => {
      assert.equal(executable, "plutil");
      assert.deepEqual(args.slice(0, -1), ["-convert", "json", "-o", "-"]);
      assert.deepEqual(options, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 2_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      commandAssertions++;
      const path = args.at(-1)!;
      commands.push(path);
      assert.ok(files.has(path), "only a registered owned synthetic fixture can be converted");
      const raw = files.get(path)!;
      if (raw instanceof Error) throw raw;
      return raw;
    },
    spawn: () => assert.fail("never launch applications"),
  },
});
const {
  createMacOsTerminalProfileDetectors: factory,
}: typeof import("../src/terminal/terminalProfileMacOs.js") = await import(
  new URL(
    `../${emitted ? "dist" : "src"}/terminal/terminalProfileMacOs.${emitted ? "js" : "ts"}`,
    import.meta.url,
  ).href
);
const env = { HOME: root };
function put(path: string, value: unknown) {
  files.set(path, JSON.stringify(value));
}
function iterm(profiles: unknown[], input = env) {
  put(itermPath(input.HOME?.trim() || root), { "New Bookmarks": profiles });
  return factory()[0]!.detect(input);
}
function terminal(settings: unknown, input = env) {
  put(terminalPath(input.HOME?.trim() || root), {
    "Startup Window Settings": "Owned",
    Owned: settings,
  });
  return factory()[1]!.detect(input);
}
const expected = (
  fontFamily?: string,
  fontSize?: number,
  theme?: TerminalDetectedProfile["theme"],
): TerminalDetectedProfile => ({ fontFamily, fontSize, theme });

test("factory preserves app order, eligibility and per-factory detector objects", () => {
  const first = factory();
  assert.deepEqual(
    first.map(({ id, platforms }) => ({ id, platforms })),
    [
      { id: "iterm2", platforms: ["darwin"] },
      { id: "macos-terminal", platforms: ["darwin"] },
    ],
  );
  assert.notStrictEqual(first, factory());
  assert.notStrictEqual(first[0], factory()[0]);
});
test("off-platform gate resolves home but performs no filesystem or conversion IO", () => {
  Object.defineProperty(process, "platform", { ...platform, value: "linux" });
  for (const detector of factory()) assert.equal(detector.detect({}), null);
  assert.equal(homeCalls, 2);
  assert.deepEqual(existence, []);
  assert.deepEqual(commands, []);
});
test("missing preferences do not convert and preserve separate ordered paths", () => {
  for (const detector of factory()) assert.equal(detector.detect(env), null);
  assert.deepEqual(existence, [itermPath(), terminalPath()]);
  assert.deepEqual(commands, []);
});
test("existence errors propagate unchanged before best-effort conversion", () => {
  const error = new Error("synthetic existence denial");
  existenceError = error;
  for (const detector of factory())
    assert.throws(
      () => detector.detect(env),
      (value) => value === error,
    );
  assert.deepEqual(commands, []);
});
for (const raw of [
  new Error("synthetic conversion failure"),
  "{",
  "null",
  "[]",
  '"text"',
  "42",
  "false",
]) {
  test(`conversion/invalid root is a silent miss: ${String(raw)}`, () => {
    files.set(itermPath(), raw);
    assert.equal(factory()[0]!.detect(env), null);
    assert.equal(commandAssertions, 1);
    assert.deepEqual(commands, [itermPath()]);
  });
}
for (const [name, input, home] of [
  ["HOME wins", { HOME: `  ${root}  `, USERPROFILE: "unused-owned" }, root],
  ["USERPROFILE fallback", { HOME: " \t ", USERPROFILE: ` ${root} ` }, root],
  ["OS home fallback", {}, root],
  ["relative root normalization", { HOME: "owned-relative/../owned-profile" }, "owned-profile"],
  ["literal tilde", { HOME: "~/owned-synthetic" }, "~/owned-synthetic"],
  [
    "literal environment expression",
    { HOME: "${OWNED_HOME}/synthetic" },
    "${OWNED_HOME}/synthetic",
  ],
] as const) {
  test(`home and path semantics: ${name}`, () => {
    put(itermPath(home), { "New Bookmarks": [{ "Normal Font": "Owned-Mono 12" }] });
    put(terminalPath(home), {
      "Startup Window Settings": "Owned",
      Owned: { FontName: "Owned Terminal" },
    });
    const detectors = factory();
    assert.deepEqual(detectors[0]!.detect(input), expected("Owned Mono", 12));
    assert.deepEqual(detectors[1]!.detect(input), expected("Owned Terminal"));
    assert.deepEqual(existence, [itermPath(home), terminalPath(home)]);
    assert.deepEqual(commands, existence);
    assert.equal(homeCalls, name === "OS home fallback" ? 2 : 0);
  });
}
test("iTerm first strict default wins ahead of earlier usable and later defaults", () => {
  assert.deepEqual(
    iterm([
      { "Normal Font": "Earlier 10", "Default Bookmark": 1 },
      { "Normal Font": "Chosen-Mono 15.5", "Default Bookmark": true },
      { "Normal Font": "Later 20", "Default Bookmark": true },
    ]),
    expected("Chosen Mono", 15.5),
  );
});
test("empty default resumes original order, skipping malformed candidates", () => {
  assert.deepEqual(
    iterm([null, 1, [], {}, { "Normal Font": "First 14" }, { "Default Bookmark": true }]),
    expected("First", 14),
  );
});
test("truthy nonboolean default marker does not reorder", () => {
  assert.deepEqual(
    iterm([
      { "Normal Font": "First 11" },
      { "Normal Font": "Marked 12", "Default Bookmark": "true" },
    ]),
    expected("First", 11),
  );
});
for (const bookmarks of [undefined, null, {}, "bad", 1, []]) {
  test(`malformed/empty bookmark container: ${JSON.stringify(bookmarks)}`, () => {
    put(itermPath(), { "New Bookmarks": bookmarks });
    assert.equal(factory()[0]!.detect(env), null);
  });
}
for (const [value, family, size] of [
  ["SFMono-Regular 13", "SFMono Regular", 13],
  [" Mono-Code 13.5  ", "Mono Code", undefined],
  [" Mono-Code 13.5", "Mono Code", 13.5],
  ["Font 5", "Font", undefined],
  ["Font 6", "Font", 6],
  ["Font 72", "Font", 72],
  ["Font 72.01", "Font", undefined],
  ["Font -12", "Font  12", undefined],
  ["Font 1e1", "Font 1e1", undefined],
  [18, "18", undefined],
  [{}, "[object Object]", undefined],
  [["Owned", "Font"], "Owned,Font", undefined],
] as const) {
  test(`descriptor coercion/grammar: ${JSON.stringify(value)}`, () => {
    assert.deepEqual(iterm([{ "Normal Font": value }]), expected(family, size));
  });
}
for (const value of [null, undefined, "", " \t "]) {
  test(`empty descriptor yields no profile: ${JSON.stringify(value)}`, () => {
    assert.equal(iterm([{ "Normal Font": value }]), null);
  });
}
test("noncallable descriptor toString is a visible projection error", () => {
  assert.throws(() => iterm([{ "Normal Font": { toString: "invalid" } }]), TypeError);
});
test("Terminal direct startup beats default, FontName wins unchanged over other family sources", () => {
  put(terminalPath(), {
    "Startup Window Settings": " Startup ",
    "Default Window Settings": "Default",
    Startup: { FontName: " Keep-Hyphen 11 ", Font: "Other-Mono 18", FontSize: "16.5px" },
    Default: { FontName: "Default" },
  });
  assert.deepEqual(factory()[1]!.detect(env), expected("Keep-Hyphen 11", 16.5));
});
test("Terminal skips invalid or empty startup and uses direct default", () => {
  for (const Startup of [null, [], "bad", {}]) {
    put(terminalPath(), {
      "Startup Window Settings": "Startup",
      "Default Window Settings": "Default",
      Startup,
      Default: { Font: "Default-Mono 17" },
    });
    assert.deepEqual(factory()[1]!.detect(env), expected("Default Mono", 17));
  }
});
test("Terminal does not discover nested settings or unreferenced root settings", () => {
  put(terminalPath(), {
    "Startup Window Settings": "Owned",
    "Window Settings": { Owned: { FontName: "Hidden" } },
    Other: { FontName: "Hidden" },
  });
  assert.equal(factory()[1]!.detect(env), null);
});
test("Terminal nonstring/empty settings references are skipped", () => {
  for (const name of [[], {}, null, 1, "", " "]) {
    put(terminalPath(), {
      "Startup Window Settings": name,
      "Default Window Settings": "Default",
      Default: { FontName: "Default" },
    });
    assert.deepEqual(factory()[1]!.detect(env), expected("Default"));
  }
});
for (const [value, size] of [
  [6, 6],
  [72, 72],
  [" 12.5px ", 12.5],
  ["1e1", 10],
  ["0x10", 18],
  [5, 18],
  [73, 18],
  ["NaN", 18],
  [null, 18],
  [{}, 18],
  [true, 18],
] as const) {
  test(`explicit font size validation/fallback: ${JSON.stringify(value)}`, () => {
    assert.deepEqual(
      terminal({ Font: "Owned-Mono 18", FontSize: value }),
      expected("Owned Mono", size),
    );
  });
}
test("size-only and theme-only profiles retain own undefined fields", () => {
  assert.deepEqual(terminal({ FontSize: 14 }), expected(undefined, 14));
  assert.deepEqual(
    iterm([{ "Background Color": "#AbC" }]),
    expected(undefined, undefined, { background: "#AbC" }),
  );
});
test("archived Font.NS latin1 matching uses only synthetic base64 data", () => {
  const data = Buffer.from("\0Synthetic-Hack-Mono\0ignored-owned-field", "latin1").toString(
    "base64",
  );
  assert.deepEqual(terminal({ Font: { NS: data } }), expected("Synthetic Hack Mono"));
  assert.deepEqual(commands, [terminalPath()]);
});
test("base64 string Font remains a literal family before archive matching", () => {
  const data = Buffer.from("\0Synthetic-Hack-Mono\0", "latin1").toString("base64");
  assert.deepEqual(terminal({ Font: data }), expected(data));
});
test("invalid/nonmatching archive allows theme while preserving absent family", () => {
  for (const Font of [{ NS: " " }, { NS: 12 }, { NS: "@@" }, []]) {
    assert.deepEqual(
      terminal({ Font, BackgroundColor: "#123" }),
      expected(undefined, undefined, { background: "#123" }),
    );
  }
});
test("archive NS coercion errors remain visible outside conversion catch", () => {
  assert.throws(() => terminal({ Font: { NS: { toString: "invalid" } } }), TypeError);
});
const ansiKeys = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
];
const terminalKeys = [
  "ANSIBlackColor",
  "ANSIRedColor",
  "ANSIGreenColor",
  "ANSIYellowColor",
  "ANSIBlueColor",
  "ANSIMagentaColor",
  "ANSICyanColor",
  "ANSIWhiteColor",
  "ANSIBrightBlackColor",
  "ANSIBrightRedColor",
  "ANSIBrightGreenColor",
  "ANSIBrightYellowColor",
  "ANSIBrightBlueColor",
  "ANSIBrightMagentaColor",
  "ANSIBrightCyanColor",
  "ANSIBrightWhiteColor",
];
test("iTerm projects all base and ANSI fields in legacy key order with alias fallback", () => {
  const profile: Record<string, unknown> = {
    "Foreground Color": "#123",
    "Background Color": "#234",
    "Cursor Color": "#345",
    "Cursor Text Color": "#456",
    "Selection Color": "#567",
  };
  const theme: Record<string, string> = {
    foreground: "#123",
    background: "#234",
    cursor: "#345",
    cursorAccent: "#456",
    selectionBackground: "#567",
  };
  ansiKeys.forEach((key, index) => {
    profile[`Ansi ${index} Color`] = index === 0 ? "invalid" : "#AbC";
    profile[`ANSI ${index} Color`] = "#dEf";
    theme[key] = index === 0 ? "#dEf" : "#AbC";
  });
  const result = iterm([profile])!;
  assert.deepEqual(result, expected(undefined, undefined, theme));
  assert.deepEqual(Object.keys(result.theme!), Object.keys(theme));
});
test("Terminal projects all four base and named ANSI fields in legacy key order", () => {
  const profile: Record<string, unknown> = {
    TextColor: "#123",
    BackgroundColor: "#234",
    CursorColor: "#345",
    SelectionColor: "#456",
    "Cursor Text Color": "#fff",
  };
  const theme: Record<string, string> = {
    foreground: "#123",
    background: "#234",
    cursor: "#345",
    selectionBackground: "#456",
  };
  ansiKeys.forEach((key, index) => {
    profile[terminalKeys[index]!] = "#AbC";
    theme[key] = "#AbC";
  });
  const result = terminal(profile)!;
  assert.deepEqual(result, expected(undefined, undefined, theme));
  assert.deepEqual(Object.keys(result.theme!), Object.keys(theme));
});
for (const [color, output] of [
  [" #aBc ", "#aBc"],
  ["#abcde", "#abcde"],
  ["#AbCdEf", "#AbCdEf"],
  ["#abcdef12", "#abcdef12"],
  ["RGBA(unvalidated", "RGBA(unvalidated"],
  ["rgb( ", "rgb("],
  ["#abcd", undefined],
  ["#abcdefg", undefined],
  ["red", undefined],
  [{ red: 0, green: 0.5, blue: 1 }, "#0080ff"],
  [{ Red: 255, Green: 128, Blue: 0 }, "#ff8000"],
  [{ "Red Component": 65535, "Green Component": 32768, "Blue Component": 256 }, "#ff8001"],
  [{ red: 1.01, green: "128px", blue: 1 }, "#0180ff"],
  [{ red: 255.01, green: 0, blue: 0 }, "#010000"],
  [{ red: 0, green: 0, blue: 0, alpha: 0 }, "rgba(0, 0, 0, 0)"],
  [{ red: 0, green: 0.5, blue: 1, Opacity: 0.12345 }, "rgba(0, 128, 255, 0.123)"],
  [{ red: 1, green: 0, blue: 0, alpha: 128 }, "rgba(255, 0, 0, 0.502)"],
  [{ red: 1, green: 0, blue: 0, alpha: "invalid" }, "#ff0000"],
  [{ red: 1, green: 0, blue: 0, alpha: -1 }, "#ff0000"],
  [{ "Red Component": null, red: 1, green: 0, blue: 0 }, undefined],
  [{ "Red Component": 0.5, red: 1, green: 0, blue: 0 }, "#800000"],
  [{ red: -0.1, green: 0, blue: 0 }, undefined],
  [{ red: 65536, green: 0, blue: 0 }, undefined],
  [{ red: true, green: 0, blue: 0 }, undefined],
  [{ red: 1, green: 0 }, undefined],
  [[], undefined],
  [null, undefined],
] as const) {
  test(`color acceptance and scaling: ${JSON.stringify(color)}`, () => {
    const result = iterm([{ "Normal Font": "Owned 12", "Background Color": color }]);
    assert.deepEqual(result, expected("Owned", 12, output ? { background: output } : undefined));
  });
}
test("private unrelated plist fields stay absent and synthetic fixture bytes do not change", () => {
  put(itermPath(), {
    "Owned Private": "never-return",
    "New Bookmarks": [
      {
        "Normal Font": "Owned 12",
        "Synthetic Secret": "never-return",
        "Remote Command": "never-execute",
        "Background Color": "#123",
      },
    ],
  });
  const before = files.get(itermPath());
  const result = factory()[0]!.detect(env);
  assert.deepEqual(result, expected("Owned", 12, { background: "#123" }));
  assert.doesNotMatch(JSON.stringify(result), /never-return|never-execute|Private|Secret/);
  assert.equal(files.get(itermPath()), before);
  assert.deepEqual(env, { HOME: root });
});
test("same detector sees changed synthetic preferences without a cache", () => {
  const detector = factory()[0]!;
  put(itermPath(), { "New Bookmarks": [{ "Normal Font": "First 12" }] });
  assert.deepEqual(detector.detect(env), expected("First", 12));
  put(itermPath(), { "New Bookmarks": [{ "Normal Font": "Second 14" }] });
  assert.deepEqual(detector.detect(env), expected("Second", 14));
  assert.deepEqual(commands, [itermPath(), itermPath()]);
});
