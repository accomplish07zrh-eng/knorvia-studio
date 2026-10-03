import type {
  OnboardingRecordEntry,
  OnboardingRecordEntryInput,
  OnboardingRecordFile,
} from "@knorvia/shared";
import { appSettingsOccupationEnum, onboardingRecordFileSchema } from "@knorvia/shared";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteText } from "../fs/atomicFileUtils.js";
import { createServiceLogger } from "../logger/serviceLogger.js";
import { getAppConfigDir } from "../paths.js";
import type { IOnboardingRecordService, OnboardingSettingsSyncPatch } from "./onboardingRecord.js";

const logger = createServiceLogger("onboardingRecordService");

function recordPath(): string {
  return join(getAppConfigDir(), "onboarding-record.json");
}

async function readRecord(filePath: string): Promise<OnboardingRecordFile | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    logger.warn(undefined, "read onboarding record failed:", error);
    return null;
  }

  try {
    return onboardingRecordFileSchema.parse(JSON.parse(raw));
  } catch (error) {
    logger.warn(undefined, "invalid onboarding record json, treating as missing. error:", error);
    return null;
  }
}

function latestLocalEntry(file: OnboardingRecordFile | null): OnboardingRecordEntry | null {
  let latest: OnboardingRecordEntry | null = null;
  if (file) {
    for (const entry of file.entries) {
      if (entry.userId === null) latest = entry;
    }
  }
  return latest;
}

export function createOnboardingRecordService(): IOnboardingRecordService {
  let writeQueue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(task, task);
    writeQueue = result.catch(() => {});
    return result;
  }

  return {
    async appendRecord(deviceMid: string, entry: OnboardingRecordEntryInput): Promise<void> {
      const userId = null;
      await enqueue(async () => {
        const filePath = recordPath();
        let file = await readRecord(filePath);
        if (file) {
          if (file.deviceMid !== deviceMid) {
            logger.warn(
              undefined,
              "deviceMid mismatch, keep existing:",
              file.deviceMid,
              "incoming:",
              deviceMid,
            );
          }
        } else {
          file = { version: 1, deviceMid, entries: [] };
        }

        const replacementIndex = file.entries.findIndex((existing) => existing.userId === userId);
        const validated = onboardingRecordFileSchema.shape.entries.element.parse({
          userId,
          ...entry,
          uploadState: "pending",
        });
        if (replacementIndex < 0) file.entries.push(validated);
        else file.entries[replacementIndex] = validated;

        await mkdir(join(filePath, ".."), { recursive: true });
        await atomicWriteText(filePath, JSON.stringify(file, null, 2));
      });
    },

    async shouldOnboard(): Promise<boolean> {
      const file = await readRecord(recordPath());
      return file === null || !file.entries.some((entry) => entry.userId === null);
    },

    async getLatestEntry(): Promise<OnboardingRecordEntry | null> {
      return latestLocalEntry(await readRecord(recordPath()));
    },

    async syncSettingsFromRecord(): Promise<OnboardingSettingsSyncPatch | null> {
      const latest = latestLocalEntry(await readRecord(recordPath()));
      if (latest === null) return null;
      const occupation = appSettingsOccupationEnum.safeParse(latest.occupation);
      return {
        onboardingOccupation: (occupation.success ? occupation.data : null) ?? "other",
        proactiveSuggestionsEnabled: latest.proactiveSuggestionsEnabled ?? false,
        memoryEnabled: latest.memoryEnabled ?? false,
      };
    },

    async updateRecordPreferences(
      patch: Partial<
        Pick<OnboardingRecordEntryInput, "memoryEnabled" | "proactiveSuggestionsEnabled">
      >,
    ): Promise<void> {
      const userId = null;
      await enqueue(async () => {
        const filePath = recordPath();
        const file = await readRecord(filePath);
        if (file === null) return;
        const index = file.entries.findLastIndex((entry) => entry.userId === userId);
        if (index < 0) return;
        file.entries[index] = onboardingRecordFileSchema.shape.entries.element.parse({
          ...file.entries[index],
          ...patch,
        });
        await atomicWriteText(filePath, JSON.stringify(file, null, 2));
      });
    },

    async getRecords(): Promise<OnboardingRecordFile | null> {
      return readRecord(recordPath());
    },

    async clearRecords(): Promise<void> {
      await enqueue(async () => {
        await rm(recordPath(), { force: true });
      });
    },
  };
}
