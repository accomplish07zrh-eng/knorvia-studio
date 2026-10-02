import { isAbsolute, posix, relative, resolve, sep } from "node:path";

interface SkillSyncPathOptions {
  unsafePathLabel?: string;
}

function unsafePath(path: string, options: SkillSyncPathOptions): Error {
  return new Error(`${options.unsafePathLabel ?? "unsafe skill sync path"}: ${path}`);
}

export function normalizeSkillSyncRelativePath(
  path: string,
  options: SkillSyncPathOptions = {},
): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  const invalidComponent = normalized
    .split("/")
    .some((part) => !part || part === "." || part === "..");
  if (
    !normalized ||
    isAbsolute(path) ||
    posix.isAbsolute(path) ||
    path.includes("\\") ||
    /^[a-zA-Z]:/u.test(path) ||
    invalidComponent
  ) {
    throw unsafePath(path, options);
  }
  return normalized;
}

export function resolveSkillSyncPathWithin(
  targetRoot: string,
  path: string,
  options: SkillSyncPathOptions = {},
): string {
  const root = resolve(targetRoot);
  const normalized = normalizeSkillSyncRelativePath(path, options);
  const target = resolve(root, ...normalized.split("/"));
  const distance = relative(root, target);
  if (!distance || distance === ".." || distance.startsWith(`..${sep}`) || isAbsolute(distance)) {
    throw unsafePath(path, options);
  }
  return target;
}
