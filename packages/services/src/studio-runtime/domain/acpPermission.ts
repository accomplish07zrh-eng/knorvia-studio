/**
 * ACP 权限选项匹配（specs/knorvia-kernel-native-media-20261010.md）。
 * 修复依据：内核只提供 allow_always / reject_always 时，原实现回复 cancelled，
 * 用户点了「允许一次」也等同拒绝，原生工具（如图片、视频生成）因此无法运行。
 * 先找同粒度的 *_once，没有时退到同方向的 *_always；方向不同的选项永不替代。
 */
export function acpPermissionOptionId(
  options: Array<Record<string, unknown>>,
  decision: string | undefined,
): unknown {
  const allow = decision === "allow-once";
  const preferred = allow ? ["allow_once", "allow_always"] : ["reject_once", "reject_always"];
  for (const kind of preferred) {
    const option = options.find((item) => item.kind === kind);
    if (option) return option.optionId;
  }
  return undefined;
}
