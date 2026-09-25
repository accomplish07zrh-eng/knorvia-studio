import * as semver from "semver";
import {
  validReleaseInfoUrl,
  type AppSettings,
  type ReleaseUpdateCheckResult,
} from "@knorvia/shared";

export const FIRST_RELEASE_CHECK_DELAY_MS = 30_000;
export const RELEASE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const MAX_RELEASE_RESPONSE_BYTES = 64 * 1024;
const RELEASE_REQUEST_TIMEOUT_MS = 6_000;

function versionFromTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return semver.valid(value.trim().replace(/^studio-/i, ""));
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty response");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > MAX_RELEASE_RESPONSE_BYTES) throw new Error("oversized response");
      chunks.push(item.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function checkReleaseUpdate(options: {
  getSettings: () => Promise<Pick<AppSettings, "releaseInfoUrl" | "releaseChecksEnabled">>;
  currentVersion: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ReleaseUpdateCheckResult> {
  const currentVersion = versionFromTag(options.currentVersion);
  if (!currentVersion)
    return { status: "failed", currentVersion: options.currentVersion, reason: "invalid-response" };
  let settings: Pick<AppSettings, "releaseInfoUrl" | "releaseChecksEnabled">;
  try {
    settings = await options.getSettings();
  } catch {
    return { status: "failed", currentVersion, reason: "settings" };
  }
  if (settings.releaseChecksEnabled === false) return { status: "disabled", currentVersion };
  const source = settings.releaseInfoUrl?.trim();
  if (!source) return { status: "unconfigured", currentVersion };
  if (!validReleaseInfoUrl(source))
    return { status: "failed", currentVersion, reason: "invalid-source" };

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? RELEASE_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await (options.fetchImpl ?? fetch)(source, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok)
      return { status: "failed", currentVersion, reason: "http", httpStatus: response.status };
    let payload: unknown;
    try {
      payload = await readBoundedJson(response);
    } catch {
      return { status: "failed", currentVersion, reason: "invalid-response" };
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return { status: "failed", currentVersion, reason: "invalid-response" };
    const release = payload as Record<string, unknown>;
    const latestVersion = versionFromTag(release.tag_name ?? release.version);
    if (!latestVersion) return { status: "failed", currentVersion, reason: "invalid-response" };
    const preview = release.prerelease === true || semver.prerelease(latestVersion) !== null;
    if (preview && semver.prerelease(currentVersion) === null)
      return { status: "no-compatible-release", currentVersion };
    if (!semver.gt(latestVersion, currentVersion))
      return { status: "up-to-date", currentVersion, latestVersion };
    const candidateUrl = release.html_url ?? release.url;
    const releaseUrl =
      typeof candidateUrl === "string" && validReleaseInfoUrl(candidateUrl)
        ? candidateUrl
        : undefined;
    return {
      status: "available",
      currentVersion,
      latestVersion,
      ...(releaseUrl ? { releaseUrl } : {}),
    };
  } catch {
    return {
      status: "failed",
      currentVersion,
      reason: controller.signal.aborted ? "timeout" : "offline",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function scheduleReleaseUpdateChecks(
  check: () => Promise<ReleaseUpdateCheckResult>,
  onResult: (result: ReleaseUpdateCheckResult) => void,
): () => void {
  let disposed = false;
  const run = () =>
    void check()
      .then((result) => {
        if (!disposed) onResult(result);
      })
      .catch(() => undefined);
  const first = setTimeout(() => {
    if (disposed) return;
    run();
    interval = setInterval(run, RELEASE_CHECK_INTERVAL_MS);
    interval.unref?.();
  }, FIRST_RELEASE_CHECK_DELAY_MS);
  first.unref?.();
  let interval: ReturnType<typeof setInterval> | undefined;
  return () => {
    disposed = true;
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}
