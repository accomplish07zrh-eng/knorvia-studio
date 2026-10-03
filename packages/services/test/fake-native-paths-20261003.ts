import { resolve, sep } from "node:path";

// 假文件端口必须共用完整本机路径；Windows 根相对路径会隐式继承 CI 的工作盘符。
// 此处仅构造测试键，不访问该盘符或真实文件。
export function fakeFsPath(pathname: string): string {
  return resolve(sep === "\\" ? "C:\\" : "/", pathname);
}
