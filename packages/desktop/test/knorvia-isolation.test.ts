import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { hostIncomingMessageSchema, hostResponseMessageSchema } from "@knorvia/shared";
import {
  buildDesktopProfileEnvironment,
  KNORVIA_APP_ID,
  resolveDesktopProfile,
} from "../src/main/desktopProfile.js";
import {
  createDeepLinkSingleInstanceData,
  extractDeepLinkUrlFromArgs,
  extractDeepLinkUrlFromSingleInstanceData,
  extractWorkspaceOpenPath,
} from "../src/main/desktopDeepLinkUrl.js";
import { resolveDesktopProductIdentity } from "../scripts/desktop-product-identity.mjs";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appData = resolve("C:/isolated-test/appdata");
const executable = resolve("D:/isolated-test/Knorvia Studio/Knorvia Studio.exe");
const defaults = { env: {}, appData, executable, packaged: true, portableMarker: false };

test("ordinary profile ignores every upstream path and identity override", () => {
  const profile = resolveDesktopProfile({
    ...defaults,
    env: {
      ZCODE_DATA_BASE_DIR: "C:/upstream",
      ZCODE_HOME: "C:/upstream/.zcode",
      ZCODE_DESKTOP_USER_DATA_DIR: "C:/upstream/profile",
      ZCODE_PORTABLE_DIR: "C:/upstream/portable",
    },
  });
  assert.equal(profile.applicationName, "Knorvia Studio");
  assert.equal(profile.base, join(appData, "Knorvia Studio"));
  assert.equal(profile.portable, false);
  for (const key of ["userData", "sessionData", "cache", "logs", "crashDumps", "temp"] as const) {
    assert.ok(!relative(profile.base, profile[key]).startsWith(".."), key);
    assert.ok(!profile[key].includes(".zcode"), key);
  }
  assert.equal(KNORVIA_APP_ID, "dev.knorvia.studio");
  assert.equal(resolveDesktopProductIdentity({}).appId, KNORVIA_APP_ID);
  assert.equal(resolveDesktopProductIdentity({ ZCODE_ENV: "test" }).productName, "Knorvia Studio");
});

test("portable marker and explicit portable directory keep all data beside their executable", () => {
  const marker = resolveDesktopProfile({ ...defaults, portableMarker: true });
  assert.equal(marker.base, join(dirname(executable), "data"));
  const portableDir = resolve("E:/Moved Studio");
  const explicit = resolveDesktopProfile({
    ...defaults,
    portableMarker: true,
    env: { KNORVIA_PORTABLE_DIR: portableDir, KNORVIA_DATA_BASE_DIR: "C:/ignored-normal" },
  });
  assert.equal(explicit.base, join(portableDir, "data"));
  const env = buildDesktopProfileEnvironment(explicit.base);
  assert.equal(env.KNORVIA_DATA_BASE_DIR, explicit.base);
  assert.equal(env.KNORVIA_HOME, join(explicit.base, ".knorvia-studio"));
  assert.equal(env.KNORVIA_STORAGE_DIR, env.KNORVIA_HOME);
  assert.equal(env.HOME, undefined);
  assert.equal(env.USERPROFILE, undefined);
});

test("invalid explicit directory fails instead of falling back", () => {
  assert.throws(
    () => resolveDesktopProfile({ ...defaults, env: { KNORVIA_PORTABLE_DIR: "relative" } }),
    /absolute/,
  );
  assert.throws(
    () => resolveDesktopProfile({ ...defaults, env: { KNORVIA_DATA_BASE_DIR: "relative" } }),
    /absolute/,
  );
});

test("new workspace protocol is accepted and all product account callbacks are rejected", () => {
  const workspace = "knorvia-studio://workspace/open?path=D%3A%2Fproject";
  assert.equal(extractDeepLinkUrlFromArgs(["app.exe", workspace]), workspace);
  assert.equal(extractWorkspaceOpenPath(new URL(workspace)), "D:/project");
  for (const url of [
    "zcode://workspace/open?path=D%3A%2Fproject",
    "knorvia-studio://oauth/callback?code=secret&state=test",
    "knorvia-studio://payment/callback?status=success",
    "knorvia-studio://share/import?shareCode=test",
  ])
    assert.equal(extractDeepLinkUrlFromArgs([url]), null, url);
  const data = createDeepLinkSingleInstanceData([workspace]);
  assert.equal(extractDeepLinkUrlFromSingleInstanceData(data), workspace);
  assert.equal(extractDeepLinkUrlFromSingleInstanceData({ zcodeDeepLinkUrl: workspace }), null);
});

test("bootstrap applies all isolated paths and child environment before later startup modules", () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const env: Record<string, string> = { HOME: "C:/system-home", USERPROFILE: "C:/system-home" };
  const app = {
    isPackaged: true,
    getPath: () => appData,
    setName: (value: string) => calls.push(["name", value]),
    setPath: (key: string, value: string) => calls.push(["path", key, value]),
    setAppUserModelId: (value: string) => calls.push(["appId", value]),
    commandLine: {
      appendSwitch: (key: string, value: string) => calls.push(["switch", key, value]),
    },
  };
  const source = readFileSync(
    join(desktopRoot, "src/main/desktopEarlyDataBaseDirBootstrap.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, {
    exports: {},
    process: {
      env,
      execPath: executable,
      resourcesPath: join(dirname(executable), "resources"),
      platform: "win32",
    },
    require: (id: string) => {
      if (id === "node:fs")
        return { existsSync: () => true, mkdirSync: (dir: string) => calls.push(["mkdir", dir]) };
      if (id === "node:path") return { dirname, join };
      if (id === "electron") return { app };
      if (id === "./desktopProfile.js")
        return {
          resolveDesktopProfile,
          KNORVIA_APP_ID,
          KNORVIA_PORTABLE_MARKER: "knorvia-portable.json",
          buildDesktopProfileEnvironment,
        };
      throw new Error(`Unexpected bootstrap dependency: ${id}`);
    },
  });
  const base = join(dirname(executable), "data");
  assert.deepEqual(
    calls.find(([kind]) => kind === "name"),
    ["name", "Knorvia Studio"],
  );
  assert.deepEqual(
    calls.find(([kind, key]) => kind === "path" && key === "userData"),
    ["path", "userData", join(base, "profile")],
  );
  assert.equal(calls.filter(([kind]) => kind === "path").length, 5);
  assert.doesNotMatch(source, /@knorvia\/services/);
  assert.equal(env.KNORVIA_DATA_BASE_DIR, base);
  assert.equal(env.KNORVIA_HOME, join(base, ".knorvia-studio"));
  assert.equal(env.KNORVIA_PORTABLE_DIR, dirname(base));
  assert.equal(env.TEMP, join(base, "temp"));
  assert.equal(env.HOME, "C:/system-home");
  assert.equal(env.USERPROFILE, "C:/system-home");
  const entry = readFileSync(join(desktopRoot, "src/main/index.ts"), "utf8");
  assert.match(
    entry,
    /^\/\*[^]*?\*\/\s*import \{ desktopProfile \} from "\.\/desktopEarlyDataBaseDirBootstrap\.js"/,
  );
  assert.ok(
    entry.indexOf("desktopEarlyDataBaseDirBootstrap") < entry.indexOf("appCrashCaptureBootstrap"),
  );
  assert.ok(
    entry.indexOf("desktopEarlyDataBaseDirBootstrap") < entry.indexOf("requestSingleInstanceLock"),
  );
  const launcher = readFileSync(join(desktopRoot, "src/main/launcher.ts"), "utf8");
  assert.match(launcher, /^import "\.\/desktopEarlyDataBaseDirBootstrap\.js"/);
  assert.match(launcher, /await import\("\.\/index\.js"\)/);
  assert.doesNotMatch(launcher, /from "@knorvia\//);
});

test("main/preload contain no product login, SDK collector or purchase bridge", () => {
  for (const file of [
    "src/main/index.ts",
    "src/main/desktopMainIpcRemote.ts",
    "src/preload/index.ts",
    "src/main/desktopWindowChrome.ts",
  ]) {
    const source = readFileSync(join(desktopRoot, file), "utf8");
    assert.doesNotMatch(
      source,
      /RegisterOAuthState|OAuthCallback|PaymentCallback|codingPlanWebview|@arms\/rum-electron|ensureDesktopDeviceMidSync/,
      file,
    );
  }
});

test("removed account provisioning cannot be invoked through the Host protocol", () => {
  assert.equal(
    hostIncomingMessageSchema.safeParse({
      type: "provider-provisioning-execute",
      requestId: "request",
      environmentKey: "remote",
      remoteSessionId: "session",
      trigger: "environment-online",
    }).success,
    false,
  );
  assert.equal(
    hostResponseMessageSchema.safeParse({
      type: "provider-provisioning-source-changed",
      trigger: "login",
    }).success,
    false,
  );
  assert.equal(
    hostResponseMessageSchema.safeParse({
      type: "provider-provisioning-execution-result",
      requestId: "request",
      environmentKey: "remote",
      status: "applied",
    }).success,
    false,
  );
});
