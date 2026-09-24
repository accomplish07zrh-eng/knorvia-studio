import type { CreationModel, CreationModelInput } from "./contract.js";

function checkedUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("请输入有效的服务地址");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash)
    throw new Error("服务地址必须是没有内嵌凭据的 HTTP 或 HTTPS 地址");
  return url.toString().replace(/\/+$/, "");
}

export function validateCreationModel(input: CreationModelInput, id: string): CreationModel {
  const name = input.name.trim();
  const modelName = input.model.trim();
  if (!name || name.length > 100) throw new Error("模型名称需在 1–100 字符之间");
  if (!modelName || modelName.length > 200) throw new Error("请填写模型标识");
  if (input.kind !== "image" && input.kind !== "video") throw new Error("不支持的创作类型");
  if (!["openai-images", "comfyui", "json-api"].includes(input.protocol))
    throw new Error("不支持的生成协议");
  if (input.protocol === "openai-images" && input.kind !== "image")
    throw new Error("OpenAI 图片协议不能用于视频生成");
  const workflowJson = input.protocol === "comfyui" ? input.workflowJson?.trim() : undefined;
  const apiMapping = input.protocol === "json-api" ? input.apiMapping : undefined;
  if (input.protocol === "comfyui") {
    if (!workflowJson) throw new Error("请填写 ComfyUI API 格式工作流");
    try {
      const graph: unknown = JSON.parse(workflowJson);
      if (!graph || typeof graph !== "object" || Array.isArray(graph))
        throw new Error("Invalid graph");
    } catch {
      throw new Error("ComfyUI 工作流必须是有效的 JSON 对象");
    }
  }
  if (input.protocol === "json-api") {
    if (
      !apiMapping?.requestPath?.trim() ||
      !apiMapping.requestTemplate?.trim() ||
      !apiMapping.outputPath?.trim()
    )
      throw new Error("请填写 API 请求路径、请求 JSON 和结果字段路径");
    if (
      (apiMapping.taskIdPath || apiMapping.pollPath || apiMapping.statusPath) &&
      !(apiMapping.taskIdPath && apiMapping.pollPath && apiMapping.statusPath)
    )
      throw new Error("异步 API 需要同时设置任务编号、查询路径和状态字段");
    if (
      [apiMapping.requestPath, apiMapping.pollPath ?? ""].some(
        (path) => /^https?:\/\//i.test(path) || path.includes(".."),
      )
    )
      throw new Error("API 路径只能填写当前服务下的相对路径");
    try {
      JSON.parse(apiMapping.requestTemplate);
    } catch {
      throw new Error("API 请求模板必须是有效 JSON");
    }
  }
  return {
    id,
    name,
    kind: input.kind,
    protocol: input.protocol,
    baseUrl: checkedUrl(input.baseUrl),
    model: modelName,
    enabled: input.enabled,
    configured: false,
    ...(workflowJson ? { workflowJson } : {}),
    ...(apiMapping ? { apiMapping } : {}),
  };
}
