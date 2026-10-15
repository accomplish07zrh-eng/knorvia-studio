// SPDX-License-Identifier: Apache-2.0
// 请求头合并：同名（大小写不敏感）后出现者覆盖先出现者，输出保留最后来源的原始拼写。
// 顺序按「最后一次出现」排列——这与 provider 侧对 header 次序的既有观察一致。

export function mergeModelRequestHeaders(
  ...patches: (Readonly<Record<string, string>> | undefined)[]
): Record<string, string> {
  const latest = new Map<string, { name: string; value: string; stamp: number }>();
  let stamp = 0;
  for (const patch of patches) {
    if (patch == null) continue;
    for (const name of Object.keys(patch)) {
      stamp += 1;
      latest.set(name.toLowerCase(), { name, value: patch[name] as string, stamp });
    }
  }
  const ordered = [...latest.values()].sort((left, right) => left.stamp - right.stamp);
  return Object.fromEntries(ordered.map((entry) => [entry.name, entry.value]));
}
