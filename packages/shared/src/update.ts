// SPDX-License-Identifier: Apache-2.0
import type { ElectronReleaseChannel, Locale } from "./protocol.js";

/** 多语言发行说明：只覆盖调用方愿意翻译的 locale，其余回落标题/正文。 */
type LocalizedReleaseNotes = Partial<Record<Locale, { title: string; markdown: string }>>;

type ReleaseNotesCore = { version: string; title: string; markdown: string };

type ReleaseNotesEnvelope = ReleaseNotesCore & {
  releaseDate?: string;
  releaseNotesByLocale?: LocalizedReleaseNotes;
};

type ReleaseNotesField = { releaseNotes?: ReleaseNotesEnvelope };
type ReleaseChannelField = { channel?: ElectronReleaseChannel };
type EnabledFlag = { enabled: boolean };

export interface PostUpdateReleaseNotesPayload extends ReleaseNotesEnvelope {}

type UpToDate = { kind: "up-to-date"; currentVersion: string };

type Available = ReleaseChannelField &
  ReleaseNotesField & {
    kind: "available";
    version: string;
  };

type Downloading = { kind: "downloading"; version: string };

type AlreadyDownloading = { kind: "already-downloading"; version: string; progress: string };

type Ready = { kind: "ready"; version: string };

type DevSkipped = { kind: "dev-skipped" };

type Failed = { kind: "error"; message: string };

/* 下载进度既可能是字节计数，也可能是原始百分比文案；两者都留给菜单展示。 */
type ProgressPayload = {
  progress: string;
  transferredBytes?: number;
  totalBytes?: number;
  version?: string;
};

type ProgressFields = ReleaseChannelField & ReleaseNotesField & ProgressPayload;

type Idle = EnabledFlag & { kind: "idle" };

type Checking = EnabledFlag & { kind: "checking" };

type UpdateAvailable = EnabledFlag &
  ReleaseChannelField &
  ReleaseNotesField & {
    kind: "update-available";
    version: string;
  };

type DownloadProgress = EnabledFlag & ProgressFields & { kind: "download-progress" };

type UpdateDownloaded = EnabledFlag &
  ReleaseChannelField &
  ReleaseNotesField & { kind: "update-downloaded"; version: string };

/* 用元组投影代替直接写长联合，只为把「检查结果」的成员集中到一处登记。 */
type CheckResultVariants = [
  UpToDate,
  Available,
  Downloading,
  AlreadyDownloading,
  Ready,
  DevSkipped,
  Failed,
];

type UpdateStateVariants = [Idle, Checking, UpdateAvailable, DownloadProgress, UpdateDownloaded];

/**
 * 用户从菜单手动点击"检查更新"后，main 进程回传给 renderer 的结果。
 * Renderer 根据 kind 展示对应的 toast；不要与启动时的自动 check 混用。
 */
export type UpdateCheckResultPayload = CheckResultVariants[number];

/**
 * 桌面自动更新器的持续状态，用于同步原生菜单和 Windows 自绘标题栏菜单。
 */
export type UpdateStatePayload = UpdateStateVariants[number] & EnabledFlag;
