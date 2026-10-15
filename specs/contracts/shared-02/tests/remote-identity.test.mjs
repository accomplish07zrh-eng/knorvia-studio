// SPDX-License-Identifier: Apache-2.0
// shared-02 合同测试：远程连接身份与资源包（B34–B39）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { barrel } from "./entry.mjs";

const {
  stripRemoteTargetSecrets,
  buildSshRemoteHostKey,
  buildRemoteEnvironmentKey,
  REMOTE_ASSET_INSTALL_MODES,
  DEFAULT_REMOTE_ASSET_INSTALL_MODE,
  normalizeRemoteAssetInstallMode,
  REMOTE_RESOURCE_PACKAGE_IDS,
  ACTIVE_REMOTE_RESOURCE_PACKAGE_IDS,
  REQUIRED_REMOTE_RESOURCE_PACKAGE_IDS,
  OPTIONAL_REMOTE_RESOURCE_PACKAGE_IDS,
  normalizeRemoteResourcePackageSelection,
  isActiveRemoteResourcePackage,
  isKnownRemoteResourcePackageId,
  isRequiredRemoteResourcePackage,
  getRemoteResourcePackageDependencies,
  isRemoteResourcePackageSelectedAsDependency,
  LOCAL_MEDIA_PREVIEW_SCHEME,
  buildLocalMediaPreviewUrl,
  BROWSER_VIEW_RESTORE_BOOTSTRAP_URL,
  BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS,
  DesktopCommandIds,
  createOpenInEditorRemoteTarget,
} = barrel;

const sshTarget = {
  kind: "ssh",
  host: "Example.COM",
  port: 2222,
  username: " dev ",
  password: "hunter2",
  privateKeyPassphrase: "pass",
  privateKeyPath: "/home/dev/.ssh/id_rsa",
};

test("B34 stripRemoteTargetSecrets：ssh 剔除 password/passphrase，wsl/docker 原样", () => {
  const stripped = stripRemoteTargetSecrets(sshTarget);
  assert.equal("password" in stripped, false);
  assert.equal("privateKeyPassphrase" in stripped, false);
  assert.equal(stripped.host, "Example.COM");
  assert.equal(stripped.privateKeyPath, "/home/dev/.ssh/id_rsa");
  assert.notEqual(stripped, sshTarget, "返回新对象");
  const wsl = { kind: "wsl", distro: "Ubuntu" };
  assert.equal(stripRemoteTargetSecrets(wsl), wsl);
  const docker = { kind: "docker", container: "knorvia" };
  assert.equal(stripRemoteTargetSecrets(docker), docker);
});

test("B35 buildSshRemoteHostKey：六元组 JSON、host 小写、端口默认 22、authKind 优先级", () => {
  assert.deepEqual(JSON.parse(buildSshRemoteHostKey(sshTarget)), [
    "ssh:v1",
    "example.com",
    2222,
    "dev",
    "private-key",
    "/home/dev/.ssh/id_rsa",
  ]);
  const noPort = buildSshRemoteHostKey({ kind: "ssh", host: "h", username: "u" });
  assert.equal(JSON.parse(noPort)[2], 22);
  assert.equal(JSON.parse(noPort)[4], "agent", "无私钥无密码 → agent");
  const password = buildSshRemoteHostKey({
    kind: "ssh",
    host: "h",
    username: "u",
    passwordCredentialKey: "cred-1",
  });
  assert.equal(JSON.parse(password)[4], "password");
  assert.ok(!buildSshRemoteHostKey(sshTarget).includes("hunter2"), "密码不得进入键");
});

test("B35 私钥路径词法归一：盘符大写、点段折叠、锚定与 UNC、~ 非锚定", () => {
  const key = (path) =>
    JSON.parse(
      buildSshRemoteHostKey({ kind: "ssh", host: "h", username: "u", privateKeyPath: path }),
    )[5];
  assert.equal(key("c:/Users/dev/../dev/./id.pem"), "C:/Users/dev/id.pem");
  assert.equal(key("c:id_rsa"), "C:id_rsa", "无斜杠盘符保持两字符前缀");
  assert.equal(key("/var/../etc/key"), "/etc/key");
  assert.equal(key("~/../secret/key"), "~/../secret/key", "非锚定 ~ 路径保留前缀与越界 ..");
  assert.equal(key(".."), "..", "单个 .. 保留");
  assert.equal(key("//server/share/./key"), "//server/share/key");
  assert.equal(key("\\\\server\\share\\key"), "//server/share/key");
  assert.equal(key("   "), "", "空白 → 空串");
});

test("B36 环境键：ssh 前缀、wsl 默认占位与 \\0 分隔、docker 取 container", () => {
  assert.ok(buildRemoteEnvironmentKey(sshTarget).startsWith('ssh:["ssh:v1",'));
  assert.equal(
    buildRemoteEnvironmentKey({ kind: "wsl", distro: " Ubuntu ", user: "  dev " }),
    `wsl:Ubuntu${String.fromCharCode(0)}dev`,
  );
  assert.equal(
    buildRemoteEnvironmentKey({ kind: "wsl" }),
    `wsl:<default>${String.fromCharCode(0)}<default>`,
  );
  assert.equal(buildRemoteEnvironmentKey({ kind: "docker", container: " box " }), "docker:box");
});

test("B37 安装模式：默认 local-download-upload、仅 remote-download 透传", () => {
  assert.deepEqual(REMOTE_ASSET_INSTALL_MODES, ["local-download-upload", "remote-download"]);
  assert.equal(DEFAULT_REMOTE_ASSET_INSTALL_MODE, "local-download-upload");
  assert.equal(normalizeRemoteAssetInstallMode("remote-download"), "remote-download");
  assert.equal(normalizeRemoteAssetInstallMode(null), "local-download-upload");
  assert.equal(normalizeRemoteAssetInstallMode(undefined), "local-download-upload");
});

test("B38 资源包集合：7 项、required 前两项、normalize 恒返回全集", () => {
  assert.deepEqual(REMOTE_RESOURCE_PACKAGE_IDS, [
    "server-bundle",
    "node-runtime",
    "node-pty",
    "knorvia",
    "bfs",
    "ripgrep",
    "ugrep",
  ]);
  assert.equal(ACTIVE_REMOTE_RESOURCE_PACKAGE_IDS.length, 7);
  assert.deepEqual([...REQUIRED_REMOTE_RESOURCE_PACKAGE_IDS], ["server-bundle", "node-runtime"]);
  assert.equal(OPTIONAL_REMOTE_RESOURCE_PACKAGE_IDS.length, 5);
  const normalized = normalizeRemoteResourcePackageSelection({ selectedPackageIds: ["bfs"] });
  assert.deepEqual(normalized, [...ACTIVE_REMOTE_RESOURCE_PACKAGE_IDS], "忽略旧选择，恒全集");
  assert.deepEqual(normalizeRemoteResourcePackageSelection(undefined), [
    ...ACTIVE_REMOTE_RESOURCE_PACKAGE_IDS,
  ]);
  assert.equal(isActiveRemoteResourcePackage("ripgrep"), true);
  assert.equal(isKnownRemoteResourcePackageId("bogus"), false);
  assert.equal(isRequiredRemoteResourcePackage("node-runtime"), true);
  assert.equal(isRequiredRemoteResourcePackage("ugrep"), false);
  assert.deepEqual(getRemoteResourcePackageDependencies("bfs"), []);
  assert.equal(
    isRemoteResourcePackageSelectedAsDependency("bfs", ["bfs"]),
    false,
    "依赖表为空 → 恒 false",
  );
});

test("B39 平台常量与本地媒体预览 URL", () => {
  assert.equal(LOCAL_MEDIA_PREVIEW_SCHEME, "knorvia-media");
  assert.equal(BROWSER_VIEW_RESTORE_BOOTSTRAP_URL, "knorvia-browser-restore://pending");
  assert.equal(BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS, 3000);
  const url = new URL(buildLocalMediaPreviewUrl("/tmp/a b.mp4"));
  assert.equal(url.protocol, "knorvia-media:");
  assert.equal(url.hostname, "local");
  assert.equal(url.pathname, "/preview");
  assert.equal(url.searchParams.get("path"), "/tmp/a b.mp4");
});

test("B39 DesktopCommandIds 28 项键值逐字不变", () => {
  assert.equal(Object.keys(DesktopCommandIds).length, 28);
  assert.deepEqual(DesktopCommandIds, {
    NewTask: "newTask",
    OpenWorkspace: "openWorkspace",
    CloseActiveContext: "closeActiveContext",
    CloseWindow: "closeWindow",
    MinimizeWindow: "minimizeWindow",
    ToggleMaximizeWindow: "toggleMaximizeWindow",
    ToggleFullScreen: "toggleFullScreen",
    ResetWindowSize: "resetWindowSize",
    ResetZoom: "resetZoom",
    ZoomIn: "zoomIn",
    ZoomOut: "zoomOut",
    ShowAbout: "showAbout",
    OpenChangelog: "openChangelog",
    CheckForUpdates: "checkForUpdates",
    RelaunchApp: "relaunchApp",
    OpenFeedback: "openFeedback",
    OpenCommunity: "openCommunity",
    ExportLogs: "exportLogs",
    ToggleDevTools: "toggleDevTools",
    OpenResourceManager: "openResourceManager",
    ToggleKnorviaStdioTapDevProxy: "toggleKnorviaStdioTapDevProxy",
    SetKnorviaEndpointProduction: "setKnorviaEndpointProduction",
    SetKnorviaEndpointTest: "setKnorviaEndpointTest",
    SetKnorviaEndpointCustom: "setKnorviaEndpointCustom",
    ResetKnorviaEndpoint: "resetKnorviaEndpoint",
    ClearAllData: "clearAllData",
    ClearCodingPlanWebviewStorage: "clearCodingPlanWebviewStorage",
    GetCuaOsSupport: "getCuaOsSupport",
  });
});

test("B39 createOpenInEditorRemoteTarget：凭据不穿透、空值字段不带", () => {
  const target = createOpenInEditorRemoteTarget(sshTarget);
  assert.deepEqual(target, {
    kind: "ssh",
    host: "Example.COM",
    port: 2222,
    username: " dev ",
  });
  assert.equal("password" in target, false);
  assert.equal("privateKeyPath" in target, false);
  assert.equal("privateKeyPassphrase" in target, false);
  const wsl = createOpenInEditorRemoteTarget({ kind: "wsl", distro: "Ubuntu", user: "   " });
  assert.deepEqual(wsl, { kind: "wsl", distro: "Ubuntu" });
  const docker = createOpenInEditorRemoteTarget({ kind: "docker", container: "box" });
  assert.deepEqual(docker, { kind: "docker", container: "box" });
});
