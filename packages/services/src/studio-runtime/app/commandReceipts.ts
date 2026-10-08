import type { StudioCommand, StudioCommandResult } from "../contract.js";
import { canonicalStudioValue } from "../domain/canonicalValue.js";
import { validateStudioCommand } from "../domain/validation.js";
import type { StudioClock, StudioRepository } from "./storePort.js";
import { studioImageRef } from "../domain/imageInput.js";
import { readStudioImages, type PreparedStudioImages } from "./imageStore.js";

interface StudioCommandReceipt {
  payload: string;
  result: StudioCommandResult;
  imagePayloadVersion?: 1;
}
function receiptPayload(
  command: StudioCommand,
  images?: Pick<PreparedStudioImages, "inputs">,
): string {
  return canonicalStudioValue(
    images && command.type === "send"
      ? { ...command, attachments: command.attachments!.map(studioImageRef) }
      : command,
  );
}
/** 受理与早期重放共用一个比较入口；调用者必须先提供完整字节校验的 Host proof。 */
export function readStudioCommandReceipt(
  db: StudioRepository,
  command: StudioCommand,
  images?: Pick<PreparedStudioImages, "inputs">,
): StudioCommandResult | undefined {
  const previous = db.read<StudioCommandReceipt>("command", command.commandId);
  if (!previous) return undefined;
  if (previous.imagePayloadVersion !== undefined && previous.imagePayloadVersion !== 1)
    throw new Error("不支持的图片回执版本");
  if (previous.imagePayloadVersion === 1 && !images)
    throw new Error("图片回执必须通过 Host 字节校验重放");
  const payload = receiptPayload(command, previous.imagePayloadVersion === 1 ? images : undefined);
  if (previous.payload !== payload) throw new Error("同一请求编号不能提交不同操作");
  if (images) {
    // 修复：摘要表示不能仅信调用方哈希；重试真实字节还必须逐字匹配原不可变内容实体。
    const stored = readStudioImages(db, images.inputs.map(studioImageRef));
    if (stored.some((image, index) => image.dataBase64 !== images.inputs[index]!.dataBase64))
      throw new Error("已受理图片内容与原请求不一致");
  }
  return previous.result;
}

/** Existing admission path, also usable in an owned task's atomic dispatch transaction. */
export function admitStudioCommandReceipt(
  db: StudioRepository,
  clock: StudioClock,
  command: StudioCommand,
  apply: (db: StudioRepository, clock: StudioClock, command: StudioCommand) => string,
  images?: Pick<PreparedStudioImages, "inputs">,
): StudioCommandResult {
  validateStudioCommand(command);
  const previous = readStudioCommandReceipt(db, command, images);
  if (previous) return previous;
  const payload = receiptPayload(command, images);
  const id = apply(db, clock, command);
  const result = { id, revision: db.revision() + 1 };
  // 图片字节已同事务写到原 image-content owner；回执仅存完整元数据与内容地址，保持 4 MiB 预算。
  db.write("command", command.commandId, {
    payload,
    result,
    ...(images ? { imagePayloadVersion: 1 } : {}),
  });
  return result;
}
