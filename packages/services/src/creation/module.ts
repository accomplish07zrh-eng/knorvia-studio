/**
 * creation 模块清单：图片与视频生成的模型配置、任务与文件保存。
 * 依赖声明与 architecture-policy.yaml 保持一致；Agent 侧 MCP 桥接属于 studio-runtime 适配层。
 */
export const creationModule = {
  id: "creation",
  requires: ["shared", "rpc", "services"],
  provides: ["creation-service"],
  publicEntrypoints: ["contract.ts", "node.ts"],
} as const;
