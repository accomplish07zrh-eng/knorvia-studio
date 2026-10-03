import { access, mkdir, readFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  type AppSettings,
  appSettingsPatchSchema,
  appSettingsSchema,
  formatLogPrefix,
  formatZodError,
} from "@knorvia/shared";
import { atomicWriteText } from "../fs/atomicFileUtils.js";
import { maybeThrowInjectedFsFault } from "../fs/fsFaultInjection.js";
import { copyDataDirectory, getDataBaseDir, validateDataBaseDirTarget } from "../paths.js";
import { isEffectiveDevelopmentNodeEnv } from "../runtime-tools/nodeEnv.js";
import { getSettingDataLocation } from "./dataLocation.js";
import { normalizeSettingsPatch } from "./normalizeSettingsPatch.js";
import type { ISettingService } from "./setting.js";
import { withSettingsWriteQueueTimeout } from "./settingsWriteQueue.js";

type SettingsRead = { settings: AppSettings; needsMigration: boolean };
type WritePermit = {
  isCurrent: () => boolean;
  assertCurrent: () => void;
  enterCommit: () => void;
};

function settingsFile(): string {
  const base = process.env.KNORVIA_DATA_BASE_DIR?.trim();
  if (base) return join(base, ".knorvia-studio", "v2", "setting.json");
  const homeOverride = process.env.KNORVIA_HOME?.trim();
  if (homeOverride) return join(homeOverride, "v2", "setting.json");
  const home =
    process.env.KNORVIA_DESKTOP_HOME_DIR?.trim() ||
    process.env.HOME?.trim() ||
    process.env.USERPROFILE?.trim() ||
    homedir();
  return join(home, ".knorvia-studio", "v2", "setting.json");
}

function defaults(): SettingsRead {
  return { settings: appSettingsSchema.parse({}), needsMigration: false };
}

function objectSettings(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createSettingService(): ISettingService {
  const prefix = formatLogPrefix("settingService", process.pid);
  let admission: Promise<void> = Promise.resolve();
  let commits: Promise<void> = Promise.resolve();

  function enqueue(operation: (permit: WritePermit) => Promise<void>): Promise<void> {
    const result = admission.then(() => {
      let current = true;
      return withSettingsWriteQueueTimeout(
        (enterCommit) =>
          operation({
            enterCommit,
            isCurrent: () => current,
            assertCurrent() {
              if (!current) throw new Error("stale settings write skipped before atomic rename");
            },
          }),
        () => {
          current = false;
        },
      );
    });
    admission = result.catch(() => undefined);
    return result;
  }

  async function read(): Promise<SettingsRead> {
    try {
      return await readStored();
    } catch (error) {
      console.log(prefix, "Settings could not be read; using defaults.", error);
      return defaults();
    }
  }

  async function readStored(): Promise<SettingsRead> {
    const file = settingsFile();
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch (error) {
      const missing =
        typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
      if (!missing) {
        console.log(prefix, "Settings could not be read; using defaults.", error);
      }
      return defaults();
    }

    for (let attempt = 0; attempt <= 3; attempt += 1) {
      let raw: unknown;
      try {
        if (attempt > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 300));
          source = await readFile(file, "utf8");
        }
        raw = JSON.parse(source) as unknown;
      } catch (error) {
        if (attempt < 3) continue;
        console.log(prefix, "Settings JSON could not be recovered; using defaults.", error);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        try {
          maybeThrowInjectedFsFault({ operation: "rename", path: file });
          await rename(file, `${file}.corrupt-${timestamp}`);
        } catch {
          // Quarantine is best effort; a failed read must still provide defaults.
        }
        return defaults();
      }

      const record = objectSettings(raw) ? raw : undefined;
      const needsMigration =
        record !== undefined &&
        (record.closeToTrayOnWindowsMigrationInitialized !== true ||
          record.messageStreamShowReasoningMigrationInitialized !== true ||
          record.studioFirstRunGuideStatus === undefined);
      const input =
        record !== undefined && !("studioFirstRunGuideStatus" in record)
          ? { ...record, studioFirstRunGuideStatus: "legacy" }
          : raw;
      const parsed = appSettingsSchema.safeParse(input);
      if (!parsed.success) {
        console.log(
          prefix,
          "Settings validation failed; using defaults.",
          formatZodError(parsed.error),
        );
        return defaults();
      }
      return { settings: parsed.data, needsMigration };
    }
    return defaults();
  }

  async function persist(settings: AppSettings, permit: WritePermit): Promise<void> {
    const file = settingsFile();
    const directory = dirname(file);
    maybeThrowInjectedFsFault({ operation: "mkdir", path: directory });
    await mkdir(directory, { recursive: true });
    if (!permit.isCurrent()) return;
    maybeThrowInjectedFsFault({ operation: "writeFile", path: file });
    await atomicWriteText(file, JSON.stringify(settings, null, 2), {
      beforeRename() {
        permit.assertCurrent();
        permit.enterCommit();
      },
      runRename(renameFile) {
        const result = commits.then(async () => {
          permit.assertCurrent();
          await renameFile();
        });
        commits = result.catch(() => undefined);
        return result;
      },
    });
  }

  return {
    async get() {
      await admission;
      const snapshot = await read();
      if (!snapshot.needsMigration) return snapshot.settings;
      await enqueue(async (permit) => {
        const latest = await read();
        if (latest.needsMigration) await persist(latest.settings, permit);
      });
      return (await read()).settings;
    },
    async getDataLocation() {
      return getSettingDataLocation();
    },
    update(patch) {
      return enqueue(async (permit) => {
        const normalized = appSettingsPatchSchema.parse(normalizeSettingsPatch(patch));
        const latest = await read();
        const settings = appSettingsSchema.parse({ ...latest.settings, ...normalized });
        settings.recentProjects = [...new Set(settings.recentProjects)].slice(0, 10);
        await persist(settings, permit);
        if (isEffectiveDevelopmentNodeEnv()) {
          console.debug(prefix, "Settings updated.", Object.keys(patch));
        }
      });
    },
    async updateDataBaseDir(newDir) {
      const location = getSettingDataLocation();
      if (location.readOnlyReason === "portable") {
        throw new Error("便携版的数据目录固定在应用旁，不能迁移到外部目录。");
      }
      if (location.readOnlyReason === "environment") {
        throw new Error("当前运行配置已固定数据目录，不能通过设置迁移。");
      }
      const target = newDir?.trim() || homedir();
      const validation = validateDataBaseDirTarget(target);
      if (!validation.ok) {
        throw Object.assign(new Error(`${validation.code}: ${validation.forbiddenDir}`), {
          code: validation.code,
        });
      }
      const source = getDataBaseDir();
      if (source !== target) {
        await copyDataDirectory(source, target);
        console.log(prefix, "Settings data directory copied.");
      }
      await this.update({ dataBaseDir: newDir });
    },
    async ensureDefaultProject(home) {
      const path = join(home, "KnorviaProject");
      let created = false;
      try {
        await access(path);
      } catch {
        created = true;
      }
      maybeThrowInjectedFsFault({ operation: "mkdir", path });
      await mkdir(path, { recursive: true });
      return { path, created };
    },
  };
}

export function createSettingServiceWithMigrations(): { service: ISettingService } {
  return { service: createSettingService() };
}
