import type { AppSettings } from "@knorvia/shared";
import { ServiceChannels } from "@knorvia/shared";
import { createServiceDescriptor } from "../descriptors.js";

export interface SettingDataLocation {
  baseDir: string;
  dataRootDir: string;
  readOnlyReason: "portable" | "environment" | null;
}

export interface ISettingService {
  get(): Promise<AppSettings>;
  /** Actual runtime paths; fixed locations cannot be migrated through settings. */
  getDataLocation(): Promise<SettingDataLocation>;
  update(patch: Partial<AppSettings>): Promise<void>;
  /** Change the data base directory: copy data from old → new location, then persist the setting. */
  updateDataBaseDir(newDir: string | undefined): Promise<void>;
  ensureDefaultProject(homedir: string): Promise<{ path: string; created: boolean }>;
}

export const ISettingService = createServiceDescriptor<ISettingService>(ServiceChannels.Setting);
