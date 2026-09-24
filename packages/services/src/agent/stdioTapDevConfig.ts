import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KnorviaStdioTapDevState } from "@knorvia/shared";
import { getAppConfigDir } from "#src/paths.js";
import { isEffectiveDevelopmentNodeEnv } from "#src/runtime-tools/nodeEnv.js";

interface KnorviaStdioTapStateFile {
  enabled?: boolean;
}

function isKnorviaStdioTapDevVisible(): boolean {
  return isEffectiveDevelopmentNodeEnv();
}

function getKnorviaStdioTapDevDir(): string {
  return join(getAppConfigDir(), "dev");
}

export function getKnorviaStdioTapDevLogDir(): string {
  return join(getKnorviaStdioTapDevDir(), "stdio-traffic");
}

function getKnorviaStdioTapDevStatePath(): string {
  return join(getKnorviaStdioTapDevDir(), "stdio-tap.json");
}

function readStateFile(path: string): KnorviaStdioTapStateFile {
  if (!existsSync(path)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as KnorviaStdioTapStateFile) : {};
  } catch {
    return {};
  }
}

export function readKnorviaStdioTapDevState(): KnorviaStdioTapDevState {
  const visible = isKnorviaStdioTapDevVisible();
  const statePath = getKnorviaStdioTapDevStatePath();
  const fileState = readStateFile(statePath);
  return {
    enabled: visible && fileState.enabled === true,
    visible,
    logDir: getKnorviaStdioTapDevLogDir(),
    statePath,
  };
}

export function setKnorviaStdioTapDevEnabled(enabled: boolean): KnorviaStdioTapDevState {
  const visible = isKnorviaStdioTapDevVisible();
  const statePath = getKnorviaStdioTapDevStatePath();
  mkdirSync(getKnorviaStdioTapDevDir(), { recursive: true });
  writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        // 开发态 stdio 抓包是高频原始协议帧，只能通过显式开关写旁路文件，避免误进生产日志。
        enabled: visible && enabled,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  return readKnorviaStdioTapDevState();
}
