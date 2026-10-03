export function normalizeRemotePlatform(rawPlatform: string): string {
  const platform = rawPlatform.trim().toLowerCase();
  if (platform === "darwin" || platform === "macos") return "darwin";
  if (platform === "linux" || platform === "gnu/linux") return "linux";
  if (
    platform === "windows_nt" ||
    platform.startsWith("mingw") ||
    platform.startsWith("msys") ||
    platform.startsWith("cygwin")
  ) {
    return "win32";
  }
  return platform;
}

export function normalizeRemoteArch(rawArch: string): string {
  const arch = rawArch.trim().toLowerCase();
  if (arch === "x86_64" || arch === "amd64") return "x64";
  if (arch === "aarch64" || arch === "arm64e") return "arm64";
  return arch;
}

export function resolveRemotePlatform(reportedPlatform: string, kernelOstype: string): string {
  const reported = normalizeRemotePlatform(reportedPlatform);
  const kernel = normalizeRemotePlatform(kernelOstype);
  return reported === "darwin" && kernel === "linux" ? "linux" : reported;
}
