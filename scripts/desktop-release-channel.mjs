// 唯一渠道 owner：正式 semver 无预发行后缀，metadata 与发布参数必须一致。
export function getReleaseChannel(version) {
  if (typeof version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$/.test(version))
    throw new Error("Invalid release version");
  const prerelease = version.includes("-");
  return { prerelease, label: prerelease ? "Prerelease channel" : "Stable release" };
}
