// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

const dimensions = ["os", "cpu", "libc"];

function scalar(text) {
  if (text.startsWith('"')) return JSON.parse(text);
  if (text.startsWith("'")) {
    if (!/^'[^']*'$/.test(text)) throw new Error("Unsupported platform metadata scalar");
    return text.slice(1, -1);
  }
  if (!/^[!@A-Za-z0-9_./*():+-]+$/.test(text))
    throw new Error("Unsupported platform metadata scalar");
  return text;
}

function platformList(value) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !/^!?[A-Za-z0-9_.-]+$/.test(item))
  )
    throw new Error("Unsupported platform metadata list");
  return value;
}

/** 只读取固定 pnpm 9 lock 包段的平铺平台字段；不以不支持的 YAML 形态授权省略。 */
export function readLockedPlatformMetadata(text) {
  if (!/^lockfileVersion: (?:'9\.0'|"9\.0"|9\.0)\s*$/m.test(text))
    throw new Error("Unsupported lockfile platform metadata version");
  const records = new Map();
  let inPackages = false;
  let sawPackages = false;
  let current;
  for (const line of text.replaceAll("\r\n", "\n").split("\n")) {
    if (line === "packages:") {
      if (sawPackages) throw new Error("Duplicate locked package metadata section");
      sawPackages = inPackages = true;
      continue;
    }
    if (/^\S/.test(line)) {
      inPackages = false;
      current = undefined;
    }
    if (!inPackages || !line.trim()) continue;
    const entry = /^ {2}(\S.*):$/.exec(line);
    if (entry) {
      const key = scalar(entry[1]);
      if (records.has(key)) throw new Error(`Duplicate locked platform metadata: ${key}`);
      current = {};
      records.set(key, current);
      continue;
    }
    const field = /^ {4}(os|cpu|libc):\s*(.*)$/.exec(line);
    if (!field) continue;
    if (!current || Object.hasOwn(current, field[1]))
      throw new Error("Duplicate platform metadata field");
    if (!/^\[[^[\]]*\]$/.test(field[2]))
      throw new Error("Unsupported locked platform metadata shape");
    const content = field[2].slice(1, -1).trim();
    current[field[1]] = platformList(
      content ? content.split(",").map((item) => scalar(item.trim())) : [],
    );
  }
  if (!sawPackages) throw new Error("Missing locked package platform metadata");
  return records;
}

export function readLockedOptionalEdges(text) {
  const parents = new Map();
  let active = false;
  let current;
  let group;
  for (const line of text.replaceAll("\r\n", "\n").split("\n")) {
    if (line === "snapshots:") {
      active = true;
      continue;
    }
    if (/^\S/.test(line)) {
      active = false;
      current = undefined;
    }
    if (!active || !line.trim()) continue;
    const entry = /^ {2}(\S.*?):(?: \{\})?$/.exec(line);
    if (entry) {
      const key = scalar(entry[1]).replace(/\(.*$/, "");
      const variants = parents.get(key) ?? [];
      current = new Map();
      variants.push(current);
      parents.set(key, variants);
      group = undefined;
      continue;
    }
    const field = /^ {4}(\S[^:]*):/.exec(line);
    if (field) {
      group = ["dependencies", "optionalDependencies"].includes(field[1]) ? field[1] : undefined;
      continue;
    }
    if (group) {
      const edge = /^ {6}(\S.*?): (\S.*)$/.exec(line);
      if (!edge || !current) throw new Error("Unsupported locked optional dependency edge");
      const alias = scalar(edge[1]);
      if (current.has(alias)) throw new Error("Duplicate locked optional dependency edge");
      current.set(alias, group === "optionalDependencies");
    }
  }
  const result = new Map();
  for (const [parent, variants] of parents) {
    const aliases = new Set(variants.flatMap((variant) => [...variant.keys()]));
    result.set(
      parent,
      new Map(
        [...aliases].map((alias) => [
          alias,
          variants.every((variant) => variant.get(alias) === true),
        ]),
      ),
    );
  }
  return result;
}

function selection(policy) {
  const { host, supportedArchitectures = {} } = policy;
  if (!host?.os || !host.cpu || (host.os === "linux" && !["glibc", "musl"].includes(host.libc)))
    throw new Error("Cannot establish audit host os/cpu/libc");
  if (
    !supportedArchitectures ||
    Array.isArray(supportedArchitectures) ||
    typeof supportedArchitectures !== "object"
  )
    throw new Error("Unsupported supported architectures shape");
  if (Object.keys(supportedArchitectures).some((key) => !dimensions.includes(key)))
    throw new Error("Unknown supported architecture dimension");
  return Object.fromEntries(
    dimensions.map((dimension) => {
      const values = supportedArchitectures[dimension] ?? ["current"];
      platformList(values);
      const resolved = [
        ...new Set(
          values.map((value) => (value === "current" ? host[dimension] : value)).filter(Boolean),
        ),
      ];
      return [dimension, resolved];
    }),
  );
}

function allowed(values, selected) {
  const positives = values.filter((value) => !value.startsWith("!"));
  const excluded = new Set(
    values.filter((value) => value.startsWith("!")).map((value) => value.slice(1)),
  );
  // pnpm 10.33.2 对混合正负列表的多目标计数不等于普通集合匹配；
  // 无法据此证明未选中时保持必需，只有其他明确排除的维度才可授权省略。
  if (positives.length && excluded.size) return true;
  return selected.some(
    (value) =>
      !excluded.has(value) &&
      (!positives.length || positives.includes("any") || positives.includes(value)),
  );
}

export function optionalOmission(item, key, policy) {
  if (!policy) return undefined;
  const selected = selection(policy);
  const metadata = policy.metadata.get(key);
  if (!metadata || Object.keys(metadata).some((key) => !dimensions.includes(key)))
    throw new Error(`Unknown locked platform metadata: ${key}`);
  for (const field of dimensions) if (Object.hasOwn(metadata, field)) platformList(metadata[field]);
  // 有一条必需路径即为必需；不能沿用按 canvas 名称豁免所有缺包的旧逻辑。
  if (!item.optional) return undefined;
  let reason;
  if (policy.includeOptional === false) reason = "Configured optional dependencies disabled";
  if (
    policy.ignoredOptionalDependencies !== undefined &&
    !Array.isArray(policy.ignoredOptionalDependencies)
  )
    throw new Error("Unsupported ignored optional package list");
  for (const pattern of policy.ignoredOptionalDependencies ?? []) {
    if (typeof pattern !== "string" || !/^[@A-Za-z0-9_./*-]+$/.test(pattern))
      throw new Error("Unsupported ignored optional package pattern");
    const regex = new RegExp(
      `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`,
    );
    if (regex.test(item.name)) reason = `Configured ignored optional dependency: ${pattern}`;
  }
  if (!reason) {
    for (const field of dimensions) {
      if (metadata[field]?.length && !allowed(metadata[field], selected[field])) {
        reason = `Platform constraint ${field}=${metadata[field].join(",")} excludes selected ${selected[field].join(",") || "none"}`;
        break;
      }
    }
  }
  return reason
    ? {
        omissionReason: reason,
        platformEvidence: { constraints: metadata, selection: selected, host: policy.host },
      }
    : undefined;
}

export function auditHost() {
  const host = { os: process.platform, cpu: process.arch };
  if (host.os === "linux") {
    const report = process.report.getReport();
    if (report.header.glibcVersionRuntime) host.libc = "glibc";
    else if (report.sharedObjects.some((path) => /(?:ld-|libc\.)musl/.test(path)))
      host.libc = "musl";
    else throw new Error("Cannot establish Linux audit host libc");
  }
  return host;
}

export function readOptionalInstallSnapshot(text) {
  let value;
  if (text.trimStart().startsWith("{")) value = JSON.parse(text).included?.optionalDependencies;
  else {
    const block = /(?:^|\n)included:\s*\n((?:[ \t]+[^\n]*\n)*)/.exec(text)?.[1];
    const raw = block?.match(/(?:^|\n) {2}optionalDependencies: (true|false)\s*(?:\n|$)/)?.[1];
    if (raw !== undefined) value = raw === "true";
  }
  if (typeof value !== "boolean") throw new Error("Unknown optional install snapshot");
  return value;
}
