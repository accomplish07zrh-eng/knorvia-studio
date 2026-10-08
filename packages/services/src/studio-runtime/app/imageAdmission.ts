import type { StudioCommand, StudioCommandResult } from "../contract.js";
import type { StudioConversation } from "../types.js";
import { canonicalStudioValue } from "../domain/canonicalValue.js";
import { requireStudioImageModel, validateStudioImageInputs } from "../domain/imageInput.js";
import { validateStudioCommand } from "../domain/validation.js";
import type { StudioClock, StudioRepository } from "./storePort.js";
import type { StudioKernelRegistry } from "./ports.js";
import type { StudioImageCodec } from "./imagePort.js";
export interface ImageAdmissionDependencies {
  db: StudioRepository;
  clock: StudioClock;
  kernels: StudioKernelRegistry;
  images?: StudioImageCodec;
}
import { studioKernelConfig } from "./runtimeProjections.js";
import { admitStudioCommand } from "./commandAdmission.js";

/** 原始命令不改写；丢 ACK 后同 CID 重试仍与持久回执逐字相等。 */
export async function admitStudioImages(
  deps: ImageAdmissionDependencies,
  original: Extract<StudioCommand, { type: "send" }>,
): Promise<StudioCommandResult> {
  validateStudioCommand(original);
  const command = structuredClone(original);
  const receipt = deps.db.read<{ payload: string; result: StudioCommandResult }>(
    "command",
    command.commandId,
  );
  if (receipt) {
    if (receipt.payload !== canonicalStudioValue(command))
      throw new Error("同一请求编号不能提交不同操作");
    return receipt.result;
  }
  if (!deps.images) throw new Error("此 Host 未提供图片解码能力");
  const chat = deps.db.read<StudioConversation>("conversation", command.targetId);
  if (!chat || chat.kernel !== "codex") throw new Error("图片仅支持本地 Codex 单聊");
  const config = command.kernelConfig ?? studioKernelConfig(deps.db, chat.kernel);
  const snapshot = canonicalStudioValue(studioKernelConfig(deps.db, chat.kernel));
  const selection = command.selection ?? chat.selection;
  const preference = selection ? selection.model : config.model;
  if (command.imageModel && preference && command.imageModel !== preference)
    throw new Error("图片模型快照与所选模型不一致");
  const selected = command.imageModel ?? preference;
  const inputs = command.attachments!;
  validateStudioImageInputs(inputs);
  for (const input of inputs) deps.images.validate(input);
  if (["/status", "/compact"].includes(command.text.trim()))
    throw new Error("此原生命令不能附带图片");
  const options = await deps.kernels.options?.({
    kernel: chat.kernel,
    workspacePath: chat.workspacePath,
    model: selected,
    config,
  });
  const model = requireStudioImageModel(options, selected);
  const current = deps.db.read<StudioConversation>("conversation", chat.id);
  if (
    !current ||
    current.kernel !== chat.kernel ||
    current.workspacePath !== chat.workspacePath ||
    current.createdAt !== chat.createdAt ||
    snapshot !== canonicalStudioValue(studioKernelConfig(deps.db, chat.kernel))
  )
    throw new Error("会话或内核配置已改变，请检查后重新发送");
  return admitStudioCommand(deps.db, deps.clock, command, { inputs, model });
}
