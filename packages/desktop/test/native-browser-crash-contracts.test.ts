import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { mock, test } from "node:test";

type Command = { command: string; args: string[]; options: Record<string, unknown> };
const calls: Command[] = [];
let respond: (command: Command) => string | Error = () => new Error("No host command allowed");
mock.module("node:child_process", {
  namedExports: {
    execFile(
      command: string,
      args: string[],
      options: Record<string, unknown>,
      callback: (error: Error | null, stdout: string) => void,
    ) {
      const request = { command, args, options };
      calls.push(request);
      const output = respond(request);
      queueMicrotask(() =>
        callback(output instanceof Error ? output : null, typeof output === "string" ? output : ""),
      );
      return {};
    },
  },
});

const installation = await import("../src/main/chromeInstallationCandidates.js");
const executable = await import("../src/main/chromeExecutableDiscovery.js");
const profile = await import("../src/main/chromeProfileDiscovery.js");
const crash = await import("../src/main/crashDumpAnnotations.js");

async function isolated(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "knorvia-native-four-"));
  calls.length = 0;
  respond = () => new Error("No host command allowed");
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function file(path: string, contents = "synthetic", executableMode = false): Promise<string> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
  await chmod(path, executableMode ? 0o755 : 0o644);
  return path;
}

async function importable(root: string, name: string, marker = "Network/Cookies"): Promise<void> {
  await file(join(root, name, marker));
}

const kinds = [
  "chrome",
  "chrome-beta",
  "chrome-dev",
  "chrome-canary",
  "chrome-for-testing",
  "chromium",
];

test("catalog callers cannot mutate the next discovery's candidate arrays", () => {
  const options = { platform: "linux" as const, homeDir: "/synthetic", env: {} };
  const first = installation.buildStandardChromeInstallations(options);
  const expected = structuredClone(first);
  first[0]!.executablePaths.push("/caller-only");
  first[0]!.userDataDir = "/caller-only";
  assert.deepEqual(installation.buildStandardChromeInstallations(options), expected);
});

test("product catalog retains all platform roots and channel order", async () =>
  isolated(async (root) => {
    const mac = installation.buildStandardChromeInstallations({
      platform: "darwin",
      homeDir: root,
      env: {},
    });
    const macProducts = [
      "Chrome",
      "Chrome Beta",
      "Chrome Dev",
      "Chrome Canary",
      "Chrome for Testing",
      "Chromium",
    ];
    const appNames = [
      "Google Chrome",
      "Google Chrome Beta",
      "Google Chrome Dev",
      "Google Chrome Canary",
      "Google Chrome for Testing",
      "Chromium",
    ];
    assert.deepEqual(
      mac.map((item) => item.browser),
      kinds,
    );
    for (let index = 0; index < kinds.length; index++) {
      const app = appNames[index]!;
      assert.deepEqual(mac[index], {
        browser: kinds[index],
        userDataDir: join(
          root,
          "Library",
          "Application Support",
          ...(index === 5 ? [] : ["Google"]),
          macProducts[index]!,
        ),
        executablePaths: [
          join("/Applications", `${app}.app`, "Contents", "MacOS", app),
          join(root, "Applications", `${app}.app`, "Contents", "MacOS", app),
        ],
      });
    }
    const local = join(root, "Local");
    const program = join(root, "Program");
    const win = installation.buildStandardChromeInstallations({
      platform: "win32",
      homeDir: root,
      env: {},
      localAppData: local,
      programFiles: program,
      programFilesX86: ` ${program} `,
    });
    const winProducts = [
      ["Google", "Chrome"],
      ["Google", "Chrome Beta"],
      ["Google", "Chrome Dev"],
      ["Google", "Chrome SxS"],
      ["Google", "Chrome for Testing"],
      ["Chromium"],
    ];
    for (let index = 0; index < kinds.length; index++) {
      assert.deepEqual(win[index], {
        browser: kinds[index],
        userDataDir: join(local, ...winProducts[index]!, "User Data"),
        executablePaths: [
          join(program, ...winProducts[index]!, "Application", "chrome.exe"),
          join(local, ...winProducts[index]!, "Application", "chrome.exe"),
        ],
      });
    }
    const config = join(root, "override");
    const linux = installation.buildStandardChromeInstallations({
      platform: "linux",
      homeDir: root,
      env: { CHROME_CONFIG_HOME: config, XDG_CONFIG_HOME: join(root, "ignored") },
    });
    assert.deepEqual(
      linux.map((item) => item.browser),
      [...kinds, "chromium", "chrome", "chromium"],
    );
    assert.deepEqual(
      linux.slice(0, 6).map((item) => item.userDataDir),
      [
        "google-chrome",
        "google-chrome-beta",
        "google-chrome-unstable",
        "google-chrome-canary",
        "google-chrome-for-testing",
        "chromium",
      ].map((name) => join(config, name)),
    );
    assert.deepEqual(linux[6], {
      browser: "chromium",
      userDataDir: join(root, "snap", "chromium", "common", "chromium"),
      executablePaths: ["/snap/bin/chromium", "/var/lib/snapd/snap/bin/chromium"],
    });
    assert.deepEqual(
      linux.slice(7).map((item) => item.userDataDir),
      [
        join(root, ".var", "app", "com.google.Chrome", "config", "google-chrome"),
        join(root, ".var", "app", "org.chromium.Chromium", "config", "chromium"),
      ],
    );
    assert.deepEqual(
      installation.buildStandardChromeInstallations({
        platform: "freebsd",
        homeDir: root,
        env: { CHROME_CONFIG_HOME: config },
      }),
      linux,
    );
  }));

test("running installation evidence retains every explicit directory and first fallback", () => {
  const fallback = [
    {
      browser: "chrome-beta" as const,
      userDataDir: "/first",
      executablePaths: ["C:/Product/chrome.exe"],
      passwordStore: "basic" as const,
    },
    {
      browser: "chrome" as const,
      userDataDir: "/second",
      executablePaths: ["c:/product/CHROME.exe"],
    },
  ];
  const result = installation.parseRunningChromeInstallations(
    [
      '"C:\\Product\\chrome.exe" --password-store=KWallet6',
      '"C:/Product/chrome.exe" --type=renderer',
      '"C:/Product/chrome.exe" --type=renderer --user-data-dir="/explicit one" --user-data-dir=/explicit-two --password-store=GNOME-LIBSECRET',
      '"C:/Product/chrome.exe" --user-data-dir=/chromium-labelled',
      '"C:/Product/chrome.exe" --password-store=invalid',
      '"C:/Product/chrome_crashpad_handler.exe" --user-data-dir=/ignored',
    ],
    fallback,
  );
  assert.deepEqual(result, [
    { ...fallback[0], executablePath: "C:\\Product\\chrome.exe", passwordStore: "kwallet6" },
    {
      browser: "chrome",
      userDataDir: "/explicit one",
      executablePaths: ["C:/Product/chrome.exe"],
      executablePath: "C:/Product/chrome.exe",
      passwordStore: "gnome-libsecret",
    },
    {
      browser: "chrome",
      userDataDir: "/explicit-two",
      executablePaths: ["C:/Product/chrome.exe"],
      executablePath: "C:/Product/chrome.exe",
      passwordStore: "gnome-libsecret",
    },
    {
      browser: "chromium",
      userDataDir: "/chromium-labelled",
      executablePaths: ["C:/Product/chrome.exe"],
      executablePath: "C:/Product/chrome.exe",
    },
    { ...fallback[0], executablePath: "C:/Product/chrome.exe" },
  ]);
});

test("process executable spelling, Mac spaces and existing parse boundaries remain", () => {
  assert.deepEqual(
    installation.parseRunningChromeExecutablePaths([
      '"C:\\Apps\\Chrome.exe" --one',
      '"c:/apps/chrome.exe" --two',
      "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta --arg",
      "/usr/bin/chromium --type=renderer",
      "/usr/bin/google-chrome-beta --arg",
      '"/usr/bin/google-chrome-beta" --arg',
      '"/usr/bin/chrome-helper" --arg',
    ]),
    [
      "C:\\Apps\\Chrome.exe",
      "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
      "/usr/bin/chromium",
      "/usr/bin/google-chrome-beta",
    ],
  );
  for (const value of [
    "chrome.exe",
    "google-chrome-stable",
    "Google Chrome for Testing",
    "com.google.Chrome",
    "org.chromium.Chromium",
  ])
    assert.equal(installation.isChromeBrowserExecutable(value), true);
  for (const value of [
    "chrome-helper",
    "chrome_crashpad_handler.exe",
    "chromium.exe",
    "Google Chrome Helper",
    "chrome/",
  ])
    assert.equal(installation.isChromeBrowserExecutable(value), false);
});

test("executable tiers preserve overrides, process and registration priority", async () =>
  isolated(async (root) => {
    const override = await file(join(root, "override", "chrome"), "", true);
    const running = await file(join(root, "running", "chromium"), "", true);
    const registered = await file(join(root, "registered", "google-chrome"), "", true);
    const options = {
      platform: "linux" as const,
      env: { CHROME_PATH: ` "${override}" ` },
      installations: [],
      processCommandLines: [`"${running}"`],
      registeredExecutablePaths: [registered],
    };
    assert.equal(await executable.resolveChromeExecutablePath(options), override);
    assert.equal(
      await executable.resolveChromeExecutablePath({
        ...options,
        env: { CHROME_PATH: "/missing/chrome", CHROME_EXECUTABLE: `'${override}'` },
      }),
      override,
    );
    assert.equal(await executable.resolveChromeExecutablePath({ ...options, env: {} }), running);
    assert.equal(
      await executable.resolveChromeExecutablePath({
        ...options,
        env: {},
        processCommandLines: [],
      }),
      registered,
    );
    assert.equal(calls.length, 0);
  }));

test("regular-file and execute-permission admission continue to later candidates", async () =>
  isolated(async (root) => {
    const blocked = await file(join(root, "blocked", "chrome"));
    const accepted = await file(join(root, "accepted", "chrome"), "", true);
    const directory = join(root, "directory", "chrome");
    await mkdir(directory, { recursive: true });
    const options = {
      env: { CHROME_PATH: directory, CHROME_EXECUTABLE: blocked },
      installations: [],
      processCommandLines: [],
      registeredExecutablePaths: [accepted],
    };
    if (process.platform !== "win32")
      assert.equal(
        await executable.resolveChromeExecutablePath({ ...options, platform: "linux" }),
        accepted,
      );
    assert.equal(
      await executable.resolveChromeExecutablePath({ ...options, platform: "win32" }),
      blocked,
    );
  }));

test("registered Linux desktop entries precede PATH and retain env token handling", async () =>
  isolated(async (root) => {
    const registered = await file(join(root, "with spaces", "chromium"), "", true);
    const pathRoot = join(root, "path");
    await file(join(pathRoot, "google-chrome"), "", true);
    const dataRoot = join(root, "data");
    await file(
      join(dataRoot, "applications", "browser.desktop"),
      `Name=Chrome\nTryExec=relative/chrome\nExec=env --unset=OLD FOO=1 "${registered}" %U\n`,
    );
    await file(join(dataRoot, "applications", "ignored.desktop"), `Exec=echo ${registered}\n`);
    assert.equal(
      await executable.resolveChromeExecutablePath({
        platform: "linux",
        homeDir: root,
        env: { PATH: pathRoot, XDG_DATA_HOME: dataRoot, XDG_DATA_DIRS: dataRoot },
        installations: [],
        processCommandLines: [],
      }),
      registered,
    );
    assert.equal(calls.length, 0);
  }));

test("Linux PATH name order dominates directory order and installation tier", async () =>
  isolated(async (root) => {
    const firstRoot = join(root, "first");
    const secondRoot = join(root, "second");
    await file(join(firstRoot, "google-chrome-stable"), "", true);
    const earlierName = await file(join(secondRoot, "google-chrome"), "", true);
    const standard = await file(join(root, "standard", "chrome"), "", true);
    assert.equal(
      await executable.resolveChromeExecutablePath({
        platform: "linux",
        env: { PATH: [firstRoot, secondRoot].join(delimiter) },
        processCommandLines: [],
        registeredExecutablePaths: [],
        installations: [{ browser: "chrome", userDataDir: root, executablePaths: [standard] }],
      }),
      earlierName,
    );
  }));

test("Mac Spotlight ignores stale applications and keeps the same query", async () =>
  isolated(async (root) => {
    const app = join(root, "Custom Chrome.app");
    const expected = await file(join(app, "Contents", "MacOS", "Google Chrome"), "", true);
    respond = ({ command }) =>
      command === "mdfind"
        ? `${join(root, "removed.app")}\n${app}\n`
        : new Error("unexpected command");
    assert.equal(
      await executable.resolveChromeExecutablePath({
        platform: "darwin",
        homeDir: root,
        env: {},
        installations: [],
        processCommandLines: [],
      }),
      expected,
    );
    assert.deepEqual(
      calls.map(({ command }) => command),
      ["mdfind"],
    );
    assert.deepEqual(calls[0]?.args, [
      "com.google.Chrome com.google.Chrome.beta com.google.Chrome.dev com.google.Chrome.canary com.google.Chrome.forTesting org.chromium.Chromium"
        .split(" ")
        .map((id) => `kMDItemCFBundleIdentifier == '${id}'`)
        .join(" || "),
    ]);
  }));

test("process enumeration keeps command options, filtering and failure continuation", async () =>
  isolated(async () => {
    respond = ({ command }) =>
      command === "powershell.exe"
        ? "C:/chrome.exe\r\n\r\nC:/chromium.exe\r\n"
        : "chrome --one\nnot-a-browser\nchromium --two\n";
    assert.deepEqual(await executable.readRunningChromeProcessCommandLines("win32"), [
      "C:/chrome.exe",
      "C:/chromium.exe",
    ]);
    assert.deepEqual(await executable.readRunningChromeProcessCommandLines("linux"), [
      "chrome --one",
      "chromium --two",
    ]);
    assert.equal(calls[0]?.args[0], "-NoProfile");
    assert.match(calls[0]?.args.at(-1) ?? "", /Get-CimInstance Win32_Process/);
    assert.deepEqual(calls[1]?.args, ["-axo", "command="]);
    for (const request of calls)
      assert.deepEqual(request.options, {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        timeout: 3000,
        windowsHide: true,
      });
    respond = () => new Error("policy denies enumeration");
    assert.deepEqual(await executable.readRunningChromeProcessCommandLines("darwin"), []);
    const before = calls.length;
    assert.deepEqual(await executable.readRunningChromeProcessCommandLines("freebsd"), []);
    assert.equal(calls.length, before);
  }));

test("profile last_used precedes Default and explicit executable keeps existence-only semantics", async () =>
  isolated(async (root) => {
    await importable(root, "Default");
    await importable(root, "Profile 2", "Cookies");
    await file(
      join(root, "Local State"),
      JSON.stringify({ profile: { info_cache: {}, last_used: "Profile 2" } }),
    );
    const marker = await readFile(join(root, "Profile 2", "Cookies"));
    const result = await profile.discoverChromeProfile({
      platform: "linux",
      env: {},
      installations: [
        {
          browser: "chrome-beta",
          userDataDir: ` ${root} `,
          executablePath: "",
          executablePaths: [],
          passwordStore: "kwallet5",
        },
      ],
    });
    assert.deepEqual(result, {
      success: true,
      source: {
        browser: "chrome-beta",
        userDataDir: root,
        profileDirectory: "Profile 2",
        profilePath: join(root, "Profile 2"),
        executablePath: "",
        passwordStore: "kwallet5",
      },
    });
    assert.deepEqual(await readFile(join(root, "Profile 2", "Cookies")), marker);
    assert.equal(calls.length, 0);
  }));

test("empty Default and stale last_used do not hide cached nonstandard importable profile", async () =>
  isolated(async (root) => {
    await mkdir(join(root, "Default"));
    await importable(root, "Work custom", "Local Storage/leveldb");
    await file(
      join(root, "Local State"),
      JSON.stringify({
        profile: { info_cache: { "Work custom": {}, Missing: {} }, last_used: "Default" },
      }),
    );
    const fallbackExe = await file(join(root, "not-a-browser"));
    const result = await profile.discoverChromeProfile({
      installations: [
        { browser: "chrome", userDataDir: root, executablePaths: ["/missing", fallbackExe] },
      ],
    });
    assert.ok(result.success);
    assert.equal(result.source.profileDirectory, "Work custom");
    assert.equal(result.source.executablePath, fallbackExe);
  }));

test("malformed Local State falls back and earliest ambiguity blocks later installation", async () =>
  isolated(async (root) => {
    const first = join(root, "first");
    const later = join(root, "later");
    await importable(first, "Profile 2");
    await importable(first, "Profile 1", "Cookies");
    await file(join(first, "Local State"), "{broken");
    await importable(later, "Default");
    assert.deepEqual(
      await profile.discoverChromeProfile({
        installations: [
          { browser: "chrome", userDataDir: first, executablePaths: [] },
          { browser: "chromium", userDataDir: later, executablePaths: [] },
        ],
      }),
      { success: false, error: "chrome_profile_ambiguous" },
    );
    await importable(first, "Default");
    const selected = await profile.discoverChromeProfile({
      installations: [{ browser: "chrome", userDataDir: first, executablePaths: [] }],
    });
    assert.ok(selected.success);
    assert.equal(selected.source.profileDirectory, "Default");
  }));

test("empty standard and environment profiles fall through to running Snap data", async () =>
  isolated(async (root) => {
    const standard = join(root, ".config", "google-chrome");
    const override = join(root, "override");
    const snap = join(root, "snap", "chromium", "common", "chromium");
    await mkdir(join(standard, "Default"), { recursive: true });
    await mkdir(join(override, "Default"), { recursive: true });
    await importable(snap, "Default");
    const result = await profile.discoverChromeProfile({
      platform: "linux",
      homeDir: root,
      env: { CHROME_USER_DATA_DIR: override },
      processCommandLines: ['"/snap/bin/chromium" --password-store=basic'],
    });
    assert.ok(result.success);
    assert.equal(result.source.userDataDir, snap);
    assert.equal(result.source.browser, "chromium");
    assert.equal(result.source.passwordStore, "basic");
    assert.equal(result.source.executablePath, "/snap/bin/chromium");
    const withoutRunning = await profile.discoverChromeProfile({
      platform: "linux",
      homeDir: root,
      env: { CHROME_USER_DATA_DIR: override },
      processCommandLines: [],
    });
    assert.ok(withoutRunning.success);
    assert.equal(withoutRunning.source.userDataDir, snap);
    assert.equal(withoutRunning.source.passwordStore, undefined);
    assert.equal(calls.length, 0);
  }));

test("empty cache names retain sole-profile rejection and ambiguity semantics", async () =>
  isolated(async (root) => {
    await file(join(root, "Cookies"));
    await file(
      join(root, "Local State"),
      JSON.stringify({ profile: { info_cache: { "": {} }, last_used: "" } }),
    );
    const options = {
      installations: [{ browser: "chrome" as const, userDataDir: root, executablePaths: [] }],
    };
    assert.deepEqual(await profile.discoverChromeProfile(options), {
      success: false,
      error: "chrome_profile_not_found",
    });
    await importable(root, "Profile 1");
    assert.deepEqual(await profile.discoverChromeProfile(options), {
      success: false,
      error: "chrome_profile_ambiguous",
    });
    await importable(root, "Default");
    const selected = await profile.discoverChromeProfile(options);
    assert.ok(selected.success);
    assert.equal(selected.source.profileDirectory, "Default");
  }));

test("policy query failure continues to HKLM and preserves unknown placeholder text", async () =>
  isolated(async (root) => {
    const expected = join(root, "work", "${unknown}");
    await importable(expected, "Default");
    // 策略扩展保留输入分隔符；原 Windows 夹具写死 / 却断言 join 的反斜杠路径。
    const policyPath = join("${profile}", "%work%", "${unknown}");
    respond = ({ args }) =>
      args[1]?.startsWith("HKCU")
        ? new Error("missing user policy")
        : `UserDataDir REG_SZ ${policyPath}\n`;
    const result = await profile.discoverChromeProfile({
      platform: "win32",
      homeDir: root,
      localAppData: join(root, "local"),
      programFiles: join(root, "program"),
      programFilesX86: join(root, "x86"),
      env: { USERPROFILE: root, WORK: "work" },
      processCommandLines: [],
    });
    assert.ok(result.success);
    assert.equal(result.source.userDataDir, expected);
    assert.equal(calls.length, 2);
  }));

test("a direct executable hit keeps operating-system registration collection lazy", async () =>
  isolated(async (root) => {
    const expected = await file(join(root, "chrome"), "", true);
    assert.equal(
      await executable.resolveChromeExecutablePath({
        platform: "darwin",
        homeDir: root,
        env: { CHROME_PATH: expected },
        installations: [],
        processCommandLines: [],
      }),
      expected,
    );
    assert.equal(calls.length, 0);
  }));

test("Windows policy roots expand placeholders in order and keep HKCU priority", async () =>
  isolated(async (root) => {
    const local = join(root, "local");
    const expected = join(local, "Corp profile");
    await importable(expected, "Default");
    await importable(join(root, "machine"), "Default");
    // 输入与原样保留的期望使用同一平台拼写，不能让生产归一化策略文本来满足夹具。
    const policyPath = join("${LOCAL_APP_DATA}", "%corp%");
    respond = ({ command, args }) => {
      assert.equal(command, "reg.exe");
      assert.deepEqual(args.slice(2), ["/v", "UserDataDir"]);
      return args[1]?.startsWith("HKCU")
        ? `UserDataDir REG_EXPAND_SZ ${policyPath}\r\n`
        : `UserDataDir REG_SZ ${join(root, "machine")}\n`;
    };
    const result = await profile.discoverChromeProfile({
      platform: "win32",
      homeDir: root,
      localAppData: local,
      programFiles: join(root, "program"),
      programFilesX86: join(root, "x86"),
      env: { CORP: "Corp profile", USERPROFILE: root },
      processCommandLines: [],
    });
    assert.ok(result.success);
    assert.equal(result.source.userDataDir, expected);
    assert.deepEqual(
      calls.map(({ args }) => args[1]),
      ["HKCU\\Software\\Policies\\Google\\Chrome", "HKLM\\Software\\Policies\\Google\\Chrome"],
    );
  }));

test("policy expansion preserves mixed separators and exact source fields", async () =>
  isolated(async (root) => {
    const expandedPolicy = `${root}/work/${"${unknown}"}`;
    await importable(expandedPolicy, "Default");
    const marker = join(expandedPolicy, "Default", "Network", "Cookies");
    const original = await readFile(marker);
    respond = ({ command, args }) => {
      assert.equal(command, "reg.exe");
      assert.deepEqual(args.slice(2), ["/v", "UserDataDir"]);
      return args[1]?.startsWith("HKCU")
        ? new Error("missing user policy")
        : "UserDataDir REG_SZ ${profile}/%work%/${unknown}\n";
    };
    assert.deepEqual(
      await profile.discoverChromeProfile({
        platform: "win32",
        homeDir: root,
        localAppData: join(root, "local"),
        programFiles: join(root, "program"),
        programFilesX86: join(root, "x86"),
        env: { USERPROFILE: root, WORK: "work" },
        processCommandLines: [],
      }),
      {
        success: true,
        source: {
          browser: "chrome",
          executablePath: undefined,
          passwordStore: undefined,
          profileDirectory: "Default",
          profilePath: join(expandedPolicy, "Default"),
          userDataDir: expandedPolicy,
        },
      },
    );
    assert.deepEqual(
      calls.map(({ args }) => args[1]),
      ["HKCU\\Software\\Policies\\Google\\Chrome", "HKLM\\Software\\Policies\\Google\\Chrome"],
    );
    assert.deepEqual(await readFile(marker), original);
  }));

test("profile absence and valid JSON null retain distinct bad-input results", async () =>
  isolated(async (root) => {
    assert.deepEqual(
      await profile.discoverChromeProfile({
        installations: [{ browser: "chrome", userDataDir: root, executablePaths: [] }],
      }),
      { success: false, error: "chrome_profile_not_found" },
    );
    await file(join(root, "Local State"), "null");
    await assert.rejects(
      profile.discoverChromeProfile({
        installations: [{ browser: "chrome", userDataDir: root, executablePaths: [] }],
      }),
      TypeError,
    );
  }));

function annotation(key: string, value: string | Buffer, position = 0): Buffer {
  const name = Buffer.from(key, "latin1");
  const body = typeof value === "string" ? Buffer.from(value) : value;
  const valueOffset = Math.ceil((position + 4 + name.length + 1) / 4) * 4 - position;
  const length = Math.ceil((position + valueOffset + 4 + body.length) / 4) * 4 - position;
  const bytes = Buffer.alloc(length);
  bytes.writeUInt32LE(name.length);
  name.copy(bytes, 4);
  bytes.writeUInt32LE(body.length, valueOffset);
  body.copy(bytes, valueOffset + 4);
  return bytes;
}

async function extracted(
  root: string,
  bytes: Buffer,
  reportedSize = bytes.length,
): Promise<Record<string, string>> {
  const path = await file(join(root, "synthetic.dmp"), "");
  await writeFile(path, bytes);
  return crash.readCrashDumpAnnotationsFromFile(path, reportedSize);
}

test("Crashpad known prefixes preserve first valid values and prefix-group output order", async () =>
  isolated(async (root) => {
    const bytes = Buffer.concat([
      annotation("pid-extra", "10"),
      annotation("ptype", "renderer"),
      annotation("v8-oom-location", "first"),
      annotation("process_type", "main"),
      annotation("v8-oom-location", "later"),
      annotation("renderer_foreground", "true"),
      annotation("other-key", "ignore"),
    ]);
    const result = await extracted(root, bytes);
    assert.deepEqual(result, {
      "v8-oom-location": "first",
      process_type: "main",
      ptype: "renderer",
      "pid-extra": "10",
      renderer_foreground: "true",
    });
    assert.deepEqual(Object.keys(result), [
      "v8-oom-location",
      "process_type",
      "ptype",
      "pid-extra",
      "renderer_foreground",
    ]);
  }));

test("Crashpad length bounds, controls, truncation and trailing NUL remain safe", async () =>
  isolated(async (root) => {
    const key64 = "v8-oom-" + "x".repeat(57);
    const key65 = key64 + "x";
    const corrupt = annotation("v8-oom-location", "invalid");
    corrupt.writeUInt32LE(1);
    const bytes = Buffer.concat([
      corrupt,
      annotation(key65, "too long"),
      annotation("v8-oom-control", "\x01"),
      annotation("v8-oom-wide", Buffer.alloc(65537, 65)),
      annotation(key64, Buffer.alloc(65536, 66)),
      annotation("v8-oom-text", "空间\t\r\n\0\0"),
      annotation("v8-oom-empty", ""),
      annotation("v8-oom-location", "valid"),
      annotation("v8-oom-truncated", "ending").subarray(0, 9),
    ]);
    assert.deepEqual(await extracted(root, bytes), {
      [key64]: "B".repeat(65536),
      "v8-oom-text": "空间\t\r\n",
      "v8-oom-empty": "",
      "v8-oom-location": "valid",
    });
    const small = annotation("v8-oom-location", "allowed");
    assert.deepEqual(await extracted(root, small, 64 * 1024 * 1024), {
      "v8-oom-location": "allowed",
    });
    assert.deepEqual(await extracted(root, small, 64 * 1024 * 1024 + 1), {});
    assert.deepEqual(crash.readCrashDumpAnnotationsFromFile(join(root, "missing"), 0), {});
  }));

test("Crashpad alignment is absolute and invalid text does not hide a later valid record", async () =>
  isolated(async (root) => {
    const first = Buffer.concat([
      Buffer.from([255, 255]),
      annotation("v8-oom-location", "unaligned", 2),
    ]);
    const bytes = Buffer.concat([
      first,
      annotation("v8-oom-bad key", "ignore"),
      annotation("v8-oom-invalid-utf8", Buffer.from([255])),
      annotation("v8-oom-tab", "\t"),
      annotation("v8-oom-del", "\x7f"),
    ]);
    assert.deepEqual(await extracted(root, bytes), {
      "v8-oom-location": "unaligned",
      "v8-oom-invalid-utf8": "�",
      "v8-oom-tab": "\t",
      "v8-oom-del": "\x7f",
    });
  }));

test("V8 summary keeps every field, conversions and diagnostics bounds", () => {
  const stack = Array.from({ length: 10 }, (_, index) => ` ${index}:${"x".repeat(170)} `);
  const result = crash.summarizeCrashDumpAnnotations({
    "v8-oom-location": "Allocate",
    process_type: "",
    ptype: "renderer",
    "v8-oom-is-main-isolate": "true",
    "v8-oom-isolate-count": "3suffix",
    "v8-oom-old-space-size": "1 GB",
    "v8-oom-old-space-capacity": "1023.94KB",
    "v8-oom-code-space-size": "0B",
    "v8-oom-code-lo-space-size": "284.93MB",
    "v8-oom-code-cage-size": "256MB",
    "v8-oom-code-cage-free-size": "3 MB",
    "v8-oom-code-cage-last-alloc-status": "ran out",
    "v8-oom-main-cage-free-size": "bad",
    "v8-oom-main-cage-last-alloc-status": "success",
    "v8-oom-trusted-cage-free-size": "2B",
    "v8-oom-memory-allocator-size": "4kb",
    "v8-oom-malloced-peak-memory": "5.5B",
    "v8-oom-stack": `\n${stack.join("\n")}\n`,
    "v8-oom-last-few-messages": `first\n\n ${"g".repeat(250)} \n`,
  });
  assert.deepEqual(result, {
    processType: "",
    location: "Allocate",
    oomKind: "code_space_exhausted",
    isMainIsolate: true,
    isolateCount: 3,
    oldSpaceBytes: 1073741824,
    oldSpaceCapacityBytes: Math.round(1023.94 * 1024),
    codeSpaceBytes: 0,
    codeLargeObjectSpaceBytes: Math.round(284.93 * 1024 * 1024),
    codeCageSizeBytes: 268435456,
    codeCageFreeBytes: 3145728,
    codeCageLastAllocStatus: "ran out",
    mainCageFreeBytes: null,
    mainCageLastAllocStatus: "success",
    trustedCageFreeBytes: 2,
    memoryAllocatorBytes: 4096,
    mallocedPeakBytes: 6,
    stackHead: stack.slice(0, 8).map((line) => `${line.trim().slice(0, 160)}…`),
    lastGcMessage: `${"g".repeat(240)}…`,
  });
  assert.deepEqual(Object.keys(result!), [
    "processType",
    "location",
    "oomKind",
    "isMainIsolate",
    "isolateCount",
    "oldSpaceBytes",
    "oldSpaceCapacityBytes",
    "codeSpaceBytes",
    "codeLargeObjectSpaceBytes",
    "codeCageSizeBytes",
    "codeCageFreeBytes",
    "codeCageLastAllocStatus",
    "mainCageFreeBytes",
    "mainCageLastAllocStatus",
    "trustedCageFreeBytes",
    "memoryAllocatorBytes",
    "mallocedPeakBytes",
    "stackHead",
    "lastGcMessage",
  ]);
});

test("OOM classification preserves precedence, exact thresholds and nullable bad values", () => {
  const cases: Array<[Record<string, string>, string]> = [
    [{}, "unknown"],
    [
      { "v8-oom-code-cage-last-alloc-status": "RAN OUT", "v8-oom-old-space-size": "1GB" },
      "code_space_exhausted",
    ],
    [
      { "v8-oom-code-cage-size": "0B", "v8-oom-code-cage-free-size": "4194303B" },
      "code_space_exhausted",
    ],
    [{ "v8-oom-code-cage-size": "256MB", "v8-oom-code-cage-free-size": "4MB" }, "unknown"],
    [{ "v8-oom-code-cage-free-size": "0B" }, "unknown"],
    [{ "v8-oom-old-space-size": "1GB" }, "js_heap_exhausted"],
    [{ "v8-oom-old-space-size": "1073741823B" }, "unknown"],
    [{ "v8-oom-main-cage-last-alloc-status": "SUCCESS" }, "js_heap_exhausted"],
    [{ "v8-oom-main-cage-last-alloc-status": "" }, "unknown"],
    [{ "v8-oom-old-space-size": "1e3MB", "v8-oom-code-cage-size": "-1GB" }, "unknown"],
  ];
  for (const [facts, kind] of cases)
    assert.equal(
      crash.summarizeCrashDumpAnnotations({ "v8-oom-location": "OOM", ...facts })?.oomKind,
      kind,
    );
  assert.equal(crash.summarizeCrashDumpAnnotations({}), null);
  assert.equal(crash.summarizeCrashDumpAnnotations({ "v8-oom-location": "" }), null);
  const invalid = crash.summarizeCrashDumpAnnotations({
    "v8-oom-location": "OOM",
    ptype: "utility",
    "v8-oom-is-main-isolate": "True",
    "v8-oom-isolate-count": "NaN",
  });
  assert.equal(invalid?.isMainIsolate, null);
  assert.equal(invalid?.isolateCount, null);
  assert.equal(invalid?.processType, "utility");
  assert.deepEqual(invalid?.stackHead, []);
  assert.equal(invalid?.lastGcMessage, null);
});
