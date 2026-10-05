import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import {
  KNORVIA_PORTABLE_MARKER,
  resolveKnorviaAppUserModelId,
  resolveDesktopProfile,
  buildDesktopProfileEnvironment,
} from "./desktopProfile.js";

declare const __KNORVIA_PRODUCT_FLAVOR__: string | undefined;

// 此模块不导入 services：先冻结环境，随后 paths.ts 第一次求值即可捕获正确的数据根。
// 必须先于 logger、crashReporter、single-instance 与 Host import 的副作用选择数据根。
export const desktopProfile = resolveDesktopProfile({
  env: process.env,
  appData: app.getPath("appData"),
  executable: process.execPath,
  packaged: app.isPackaged,
  portableMarker: existsSync(join(process.resourcesPath, KNORVIA_PORTABLE_MARKER)),
  platform: process.platform,
});
app.setName(desktopProfile.applicationName);
for (const path of [
  desktopProfile.userData,
  desktopProfile.sessionData,
  desktopProfile.cache,
  desktopProfile.logs,
  desktopProfile.crashDumps,
  desktopProfile.temp,
])
  mkdirSync(path, { recursive: true });
app.setPath("userData", desktopProfile.userData);
app.setPath("sessionData", desktopProfile.sessionData);
app.setPath("logs", desktopProfile.logs);
app.setPath("crashDumps", desktopProfile.crashDumps);
app.setPath("temp", desktopProfile.temp);
app.commandLine.appendSwitch("disk-cache-dir", desktopProfile.cache);
// AUMID 只在这里设置一次，先于任何窗口、托盘与通知，避免进程中途切换身份导致任务栏图标丢失。
if (process.platform === "win32")
  app.setAppUserModelId(
    resolveKnorviaAppUserModelId({
      packaged: app.isPackaged,
      flavor:
        typeof __KNORVIA_PRODUCT_FLAVOR__ !== "undefined" ? __KNORVIA_PRODUCT_FLAVOR__ : undefined,
    }),
  );
Object.assign(process.env, buildDesktopProfileEnvironment(desktopProfile.base));
if (desktopProfile.portable) process.env.KNORVIA_PORTABLE_DIR = dirname(desktopProfile.base);
process.env.TEMP = desktopProfile.temp;
process.env.TMP = desktopProfile.temp;
