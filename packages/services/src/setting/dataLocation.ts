import { getDataBaseDir, getKnorviaDataRootDir } from "../paths.js";
import type { SettingDataLocation } from "./setting.js";

export function getSettingDataLocation(): SettingDataLocation {
  return {
    baseDir: getDataBaseDir(),
    dataRootDir: getKnorviaDataRootDir(),
    readOnlyReason: process.env.KNORVIA_PORTABLE_DIR?.trim()
      ? "portable"
      : process.env.KNORVIA_DATA_BASE_DIR?.trim() || process.env.KNORVIA_HOME?.trim()
        ? "environment"
        : null,
  };
}
