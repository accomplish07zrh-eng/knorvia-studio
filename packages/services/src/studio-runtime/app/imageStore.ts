import { errorText } from "../domain/kernelPolicy.js";
import type { StudioImageInput, StudioImageReadResult, StudioImageRef } from "../imageTypes.js";
import { canonicalStudioValue } from "../domain/canonicalValue.js";
import { studioImageRef } from "../domain/imageInput.js";
import type { StudioRepository } from "./storePort.js";
import type { StudioImageCodec } from "./imagePort.js";
import type { StudioTimeline } from "../types.js";
import { validStudioId } from "../domain/validation.js";
export interface PreparedStudioImages {
  inputs: StudioImageInput[];
  model: string;
}
export function persistStudioImages(
  db: StudioRepository,
  inputs: StudioImageInput[],
): StudioImageRef[] {
  for (const input of inputs) {
    const content = {
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      sha256: input.sha256,
      dataBase64: input.dataBase64,
    };
    const previous = db.read("image-content", input.sha256);
    if (previous && canonicalStudioValue(previous) !== canonicalStudioValue(content))
      throw new Error("图片内容地址冲突");
    if (!previous) db.write("image-content", input.sha256, content);
  }
  return inputs.map(studioImageRef);
}
export function readStudioImages(db: StudioRepository, refs: StudioImageRef[]): StudioImageInput[] {
  return refs.map((ref) => {
    const content = db.read<Omit<StudioImageInput, "id" | "filename">>("image-content", ref.sha256);
    if (
      !content ||
      content.sha256 !== ref.sha256 ||
      content.sizeBytes !== ref.sizeBytes ||
      content.mimeType !== ref.mimeType ||
      content.width !== ref.width ||
      content.height !== ref.height
    )
      throw new Error("已受理图片内容缺失，请重新添加图片并新建消息");
    return { ...content, ...ref };
  });
}
export function readStudioImage(
  deps: { db: StudioRepository; images?: StudioImageCodec },
  targetId: string,
  runId: string | undefined,
  imageId: string,
): StudioImageReadResult {
  const run = runId
    ? deps.db.read<{ targetId: string; attachments?: StudioImageRef[] }>("run", runId)
    : undefined;
  const ref = run?.attachments?.find((item) => item.id === imageId);
  if (!run || run.targetId !== targetId || !ref) throw new Error("此图片不属于目标会话与运行");
  try {
    const input = readStudioImages(deps.db, [ref])[0]!;
    if (!deps.images) throw new Error("此 Host 未提供图片解码能力");
    deps.images.validate(input);
    return { input };
  } catch (error) {
    return { error: errorText(error) };
  }
}

/** 同一持久 owner 的只读受理投影；回执本身不证明另一个 Host 的提交归属。 */
export function readStudioImageAdmission(
  db: StudioRepository,
  targetId: string,
  commandId: string,
): StudioTimeline["admission"] {
  // 修复：贴图与快照合并使服务超过架构上限，将既有读取移回图片投影模块，保持原验证顺序。
  validStudioId(commandId);
  const receipt = db.read<{ result: { id: string } }>("command", commandId);
  const run = receipt
    ? db.read<{ id: string; targetId: string; admissionCommandId?: string }>(
        "run",
        receipt.result.id,
      )
    : undefined;
  return run && run.targetId === targetId && run.admissionCommandId === commandId
    ? { commandId, runId: run.id }
    : undefined;
}
