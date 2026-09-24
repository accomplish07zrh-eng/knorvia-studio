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

function getRecordFile(): string {
  // 本地引导偏好跟随应用数据目录；不读取或关联产品账户。
  return join(getAppConfigDir(), "onboarding-record.json");
}

/**
 * 读取记录文件；文件不存在返回 null，内容损坏（手改/写坏）时同样返回 null 并 warn——
 * 损坏文件等价于"从未记录"，重新触发引导后在下次 append 时重建。
 */
async function readRecordFile(filePath: string): Promise<OnboardingRecordFile | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return null;
    logger.warn(undefined, "read onboarding record failed:", err);
    return null;
  }
  try {
    return onboardingRecordFileSchema.parse(JSON.parse(raw));
  } catch (cause) {
    logger.warn(undefined, "invalid onboarding record json, treating as missing. error:", cause);
    return null;
  }
}

export function createOnboardingRecordService(): IOnboardingRecordService {
  // 串行化写：引导保存与并发触发判定同时发生时不丢条目。
  let writeQueue: Promise<unknown> = Promise.resolve();
  const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
    const queued = writeQueue.then(task, task) as Promise<T>;
    writeQueue = queued.catch(() => {});
    return queued;
  };

  return {
    async appendRecord(deviceMid: string, entry: OnboardingRecordEntryInput): Promise<void> {
      const userId = null;
      await enqueueWrite(async () => {
        const filePath = getRecordFile();
        const existing = await readRecordFile(filePath);
        // deviceMid 以文件内已有值为权威：本地文件不变是设备关联的前提，
        // 调用方传入不同值只说明异常（如 getDeviceId 行为变化），记录并沿用旧值。
        let file: OnboardingRecordFile;
        if (existing) {
          if (existing.deviceMid !== deviceMid) {
            logger.warn(
              undefined,
              "deviceMid mismatch, keep existing:",
              existing.deviceMid,
              "incoming:",
              deviceMid,
            );
          }
          file = existing;
        } else {
          file = { version: 1, deviceMid, entries: [] };
        }
        const record: OnboardingRecordEntry = {
          userId,
          ...entry,
          uploadState: "pending",
        };
        // 当前资料只保存一条本地偏好；兼容 schema 的 userId/uploadState 不触发账户或上传。
        const previousIndex = file.entries.findIndex((item) => item.userId === userId);
        const validated = onboardingRecordFileSchema.shape.entries.element.parse(record);
        if (previousIndex >= 0) file.entries[previousIndex] = validated;
        else file.entries.push(validated);
        await mkdir(join(filePath, ".."), { recursive: true });
        await atomicWriteText(filePath, JSON.stringify(file, null, 2));
      });
    },

    async shouldOnboard(): Promise<boolean> {
      const userId = null;
      const file = await readRecordFile(getRecordFile());
      if (!file) return true;
      return !file.entries.some((entry) => entry.userId === userId);
    },

    async getLatestEntry(): Promise<OnboardingRecordEntry | null> {
      const userId = null;
      const file = await readRecordFile(getRecordFile());
      if (!file) return null;
      let latest: OnboardingRecordEntry | undefined;
      for (const entry of file.entries) {
        if (entry.userId === userId) latest = entry;
      }
      return latest ?? null;
    },

    async syncSettingsFromRecord(): Promise<OnboardingSettingsSyncPatch | null> {
      const userId = null;
      const file = await readRecordFile(getRecordFile());
      if (!file) return null;
      // append 是覆盖语义，正常每 userId 至多一条；兼容旧版本的重复追加文件时取最后一条。
      let latest: OnboardingRecordEntry | undefined;
      for (const entry of file.entries) {
        if (entry.userId === userId) latest = entry;
      }
      if (!latest) return null;
      // 跳过页记 null：回填保守默认，与引导跳过写 settings 的行为一致（职业 other、偏好关）。
      // record 的 occupation 是非枚举字符串（职业列表会演进），窄化到 settings 的枚举；
      // 旧版本可能落过已收窄/未知的职业值，未知值回填 other，与推荐池的兜底一致。
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
      await enqueueWrite(async () => {
        const filePath = getRecordFile();
        const file = await readRecordFile(filePath);
        if (!file) return;
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
      return readRecordFile(getRecordFile());
    },

    async clearRecords(): Promise<void> {
      await enqueueWrite(async () => {
        await rm(getRecordFile(), { force: true });
      });
    },
  };
}
