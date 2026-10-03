import { posix } from "node:path";

export interface RemoteCdnBaseOptions {
  remoteCdnBaseUrl?: string;
  remoteCdnBaseUrls?: string[];
}

const distinct = (items: string[]): string[] => Array.from(new Set(items));
const withoutFinalSlashes = (value: string): string => value.replace(/\/+$/, "");

export function resolveRemoteCdnBaseUrls(options: RemoteCdnBaseOptions): string[] {
  const values = [...(options.remoteCdnBaseUrls ?? []), options.remoteCdnBaseUrl ?? ""];
  return distinct(values.map((value) => value.trim()).filter((value) => value.length > 0));
}

export function buildReleaseBaseCandidates(remoteCdnBaseUrls: string[], version: string): string[] {
  const candidates: string[] = [];
  // 保留原候选展开对稀疏数组空位的跳过语义，避免将空位当作字符串处理。
  remoteCdnBaseUrls.forEach((input) => {
    const base = withoutFinalSlashes(input);
    if (base.endsWith(`/${version}`)) candidates.push(base);
    else candidates.push(`${base}/${version}`, base);
  });
  return distinct(candidates);
}

export function normalizeRemoteAssetRelativePath(rawPath: string, label: string): string {
  const value = rawPath.trim();
  const report = (reason: string): never => {
    throw new Error(`[remote-assets] ${label} ${reason}: ${rawPath}`);
  };
  if (value.length === 0) throw new Error(`[remote-assets] ${label} is empty`);
  if (value.includes("\\")) report("must not contain backslash");
  if (value.startsWith("/") || /^[a-z]:/i.test(value)) report("must be relative path");
  const segments = value.split("/");
  if (segments.includes("")) report("contains empty path segment");
  if (segments.includes("..")) report("must not contain '..'");
  if (segments.includes(".")) report("must not contain '.'");
  const normalized = posix.normalize(value).split("/");
  if (normalized.some((segment) => segment === "" || segment === "." || segment === "..")) {
    report("is invalid after normalize");
  }
  return normalized.join("/");
}

function encodePathSegment(value: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

function assetAddress(base: string, normalizedPath: string): string {
  const encoded = normalizedPath.split("/").map(encodePathSegment).join("/");
  return `${withoutFinalSlashes(base)}/${encoded}`;
}

export function buildReleaseAssetUrlCandidates(
  releaseBaseCandidates: string[],
  fileCandidates: string[],
): string[] {
  const candidates: string[] = [];
  for (const file of fileCandidates) {
    const path = normalizeRemoteAssetRelativePath(file, "release asset path");
    for (const base of releaseBaseCandidates) candidates.push(assetAddress(base, path));
  }
  return distinct(candidates);
}

export function buildArtifactUrlCandidates(
  remoteCdnBaseUrls: string[],
  artifactPath: string,
): string[] {
  const path = normalizeRemoteAssetRelativePath(artifactPath, "artifactPath");
  return distinct(remoteCdnBaseUrls.map((base) => assetAddress(base, path)));
}

export function buildComponentReleaseBaseCandidates(
  releaseBaseCandidates: string[],
  version: string,
): string[] {
  const candidates: string[] = [];
  const suffix = `/${version}`;
  releaseBaseCandidates.forEach((input) => {
    const base = withoutFinalSlashes(input);
    if (base.endsWith(suffix)) candidates.push(base.slice(0, -suffix.length));
    candidates.push(base);
  });
  return distinct(candidates.filter((candidate) => candidate.length !== 0));
}

export function buildComponentArtifactUrlCandidates(
  releaseBaseCandidates: string[],
  artifactPath: string,
  version: string,
): string[] {
  return buildArtifactUrlCandidates(
    buildComponentReleaseBaseCandidates(releaseBaseCandidates, version),
    artifactPath,
  );
}

export function assertRemoteCdnBaseVersionMatches(
  remoteCdnBaseUrls: string[],
  expectedVersion: string,
): void {
  const mismatches: string[] = [];
  const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  remoteCdnBaseUrls.forEach((supplied) => {
    let path = withoutFinalSlashes(supplied);
    try {
      path = new URL(path).pathname;
    } catch {
      /* Relative bases retain their literal path text. */
    }
    const segments = path.split("/").filter((segment) => segment.length > 0);
    const last = segments.at(-1);
    if (last && versionPattern.test(last) && last !== expectedVersion) {
      mismatches.push(`${last} (${supplied})`);
    }
  });
  if (mismatches.length > 0) {
    throw new Error(
      `[remote-assets] remoteCdnBaseUrl 版本不匹配：当前应用版本是 ${expectedVersion}，但以下基址固定在其他版本：${mismatches.join(", ")}。请将 KNORVIA_REMOTE_ASSET_CDN_BASE_URL 改为不带版本的发布根目录，或改为 ${expectedVersion} 对应目录。`,
    );
  }
}
