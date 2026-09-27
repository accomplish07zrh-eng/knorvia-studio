// Test-only preload: runs before packaged Main and every forked local Host.
// No application services are replaced; only local paths, visibility and network egress are bounded.
const assert = require("node:assert/strict");
const { appendFileSync, existsSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const net = require("node:net");
const root = process.env.KNORVIA_MEDIA_ACCEPTANCE_ROOT;
assert(root && existsSync(join(root, "acceptance-owner.json")), "Missing isolated test owner");
const loopback = (host) => ["127.0.0.1", "::1", "[::1]", "localhost"].includes(host);
const deny = (host) => {
  appendFileSync(
    join(root, "blocked-network.jsonl"),
    JSON.stringify({ pid: process.pid, host }) + "\n",
  );
  throw new Error("Media acceptance blocks non-loopback network");
};
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const candidate = Array.isArray(args[0]) ? args[0] : args;
  const options = candidate[0];
  // Local named pipes are used for Electron IPC. TCP without a host defaults to localhost.
  if (typeof options === "object" && options && !options.path) {
    if (options.host && !loopback(options.host)) deny(options.host);
  } else if (typeof options === "number" && typeof candidate[1] === "string") {
    if (!loopback(candidate[1])) deny(candidate[1]);
  }
  return originalConnect.apply(this, args);
};
require("node:module").syncBuiltinESMExports();
const probe = new net.Socket();
assert.throws(
  () => probe.connect({ host: "network-block.invalid", port: 443 }),
  /blocks non-loopback/,
);
probe.destroy();
writeFileSync(
  join(root, `guard-${process.pid}.json`),
  JSON.stringify({ pid: process.pid, type: process.type ?? "node", blockedProbe: true }),
);

if (process.type === "browser") {
  const { app, BrowserWindow, session, utilityProcess, net: electronNet } = require("electron");
  app.setPath("appData", join(root, "AppData", "Roaming"));
  app.setPath("home", root);
  // 直接禁止 show，避免先出现再 hide 的首帧闪窗；仅在验收 preload 中生效。
  BrowserWindow.prototype.show = function () {
    this.hide();
  };
  BrowserWindow.prototype.showInactive = function () {
    this.hide();
  };
  app.on("browser-window-created", (_event, win) => {
    win.webContents.setBackgroundThrottling(false);
    win.hide();
  });
  const request = electronNet.request.bind(electronNet);
  electronNet.request = (input) => {
    const url = typeof input === "string" ? input : input.url;
    const host = url ? new URL(url).hostname : (input.hostname ?? input.host);
    if (!loopback(host)) deny(host);
    return request(input);
  };
  const fetch = electronNet.fetch.bind(electronNet);
  electronNet.fetch = (input, options) => {
    if (!loopback(new URL(typeof input === "string" ? input : input.url).hostname))
      deny("electron-fetch");
    return fetch(input, options);
  };
  app.on("ready", () => {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*"] },
      (details, callback) => {
        const blocked = !loopback(new URL(details.url).hostname);
        if (blocked)
          appendFileSync(
            join(root, "blocked-network.jsonl"),
            JSON.stringify({
              pid: process.pid,
              host: new URL(details.url).hostname,
              layer: "chromium",
            }) + "\n",
          );
        callback({ cancel: blocked });
      },
    );
  });
  const fork = utilityProcess.fork.bind(utilityProcess);
  utilityProcess.fork = (path, args, options = {}) =>
    fork(path, args, {
      ...options,
      execArgv: ["--require", resolve(__filename), ...(options.execArgv ?? [])],
      env: { ...(options.env ?? process.env), KNORVIA_MEDIA_ACCEPTANCE_ROOT: root },
    });
  process.on("uncaughtException", (error) => {
    console.error(error);
    app.exit(1);
  });
}
