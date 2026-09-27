import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const ICONS_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "../src/icons");
export const KNORVIA_LUCIDE_MODULE = resolve(ICONS_DIRECTORY, "knorviaLucide.generated.ts");

const normalize = (path: string) => path.replaceAll("\\", "/");

/**
 * 把整个 renderer 的 `lucide-react` 导入统一指向 Knorvia 图标模块。
 * 这是图标语言的唯一接入点：业务组件保持原导入不变，新字形与别名由生成模块覆盖，
 * 未覆盖的名称继续透传 lucide。图标目录自身导入真实的 lucide-react，避免循环。
 */
export function knorviaIconsPlugin(): Plugin {
  const iconsPrefix = `${normalize(ICONS_DIRECTORY)}/`;
  return {
    name: "knorvia:icons",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (source !== "lucide-react") return null;
      if (importer && normalize(importer).startsWith(iconsPrefix)) {
        return this.resolve(source, importer, { ...options, skipSelf: true });
      }
      return KNORVIA_LUCIDE_MODULE;
    },
  };
}
