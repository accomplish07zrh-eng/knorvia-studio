/**
 * 仅扫描当前选定的 Knorvia 数据根，便携实例不能扫描其他安装的用户资料。
 * 路径来源由调用方注入（desktop host 传 homedir 与 getDataBaseDir），模块内不读环境变量。
 */
import type { StorageRootSpec } from "@knorvia/shared";
import { join, resolve } from "node:path";
import type { RootsResolverPort } from "../app/ports.js";

const KNORVIA_DATA_DIR_NAME = ".knorvia-studio";

export function resolveStorageRoots(params: {
  homeDir: string;
  dataBaseDir: string;
}): StorageRootSpec[] {
  const home = resolve(params.homeDir);
  const dataBase = resolve(params.dataBaseDir);
  const hasCustomDataBaseDir = dataBase !== home;
  return [
    {
      id: hasCustomDataBaseDir ? "dataBaseDir" : "home",
      path: join(dataBase, KNORVIA_DATA_DIR_NAME),
      hasCustomDataBaseDir,
    },
  ];
}

export function createStorageRootsResolver(params: {
  getHomeDir: () => string;
  getDataBaseDir: () => string;
}): RootsResolverPort {
  return {
    resolveRoots: async () =>
      resolveStorageRoots({ homeDir: params.getHomeDir(), dataBaseDir: params.getDataBaseDir() }),
  };
}
