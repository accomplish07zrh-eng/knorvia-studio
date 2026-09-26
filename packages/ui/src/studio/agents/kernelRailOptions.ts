import type { StudioKernelId, StudioKernelOption } from "../types.js";

/** 快捷区有界，但当前自定义或远程内核始终可见；完整目录保留在菜单中。 */
export function kernelRailOptions(
  options: readonly StudioKernelOption[],
  selected: StudioKernelId,
): StudioKernelOption[] {
  const shortcuts = options.slice(0, 4);
  const current = options.find((option) => option.id === selected);
  if (current && !shortcuts.some((option) => option.id === selected)) {
    shortcuts[shortcuts.length - 1] = current;
  }
  return shortcuts;
}
