import type { CreationReuseDraft } from "@knorvia/services";

export type CreationSlot = "reference" | "firstFrame" | "lastFrame";
export type CreationFiles = Record<CreationSlot, File | null>;
export const CREATION_SLOTS: CreationSlot[] = ["reference", "firstFrame", "lastFrame"];
export const CREATION_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** 参考图上限与 createJob 的服务端校验共用同一条边界。 */
export const CREATION_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;

function fileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取参考图"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** 提交前在本地拒绝超限或模型未配置的参考图，服务端仍会再次校验。 */
export function assertCreationFiles(
  files: CreationFiles,
  slots: { image?: boolean; firstFrame?: boolean; lastFrame?: boolean } | null,
): void {
  for (const file of Object.values(files)) {
    if (
      file &&
      (file.size > CREATION_REFERENCE_MAX_BYTES || !CREATION_IMAGE_TYPES.includes(file.type))
    )
      throw new Error("参考图只支持 10 MB 内的 PNG、JPEG 或 WebP");
  }
  if (files.reference && !slots?.image) throw new Error("当前模型未配置图生图输入");
  if (files.firstFrame && !slots?.firstFrame) throw new Error("当前模型未配置首帧输入");
  if (files.lastFrame && !slots?.lastFrame) throw new Error("当前模型未配置尾帧输入");
}

/** reuseJob 以 base64 返回参考图；表单仍以 File 表示，这里在本地还原为等价文件。 */
export function creationFileFromBase64(input: {
  name: string;
  mimeType: string;
  dataBase64: string;
}): File {
  const binary = atob(input.dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], input.name, { type: input.mimeType });
}

/** 复用草稿回填输入区：提示词之外的参考图与首尾帧也一并还原。 */
export function creationDraftFiles(draft: CreationReuseDraft): CreationFiles {
  return {
    reference: draft.reference ? creationFileFromBase64(draft.reference) : null,
    firstFrame: draft.firstFrame ? creationFileFromBase64(draft.firstFrame) : null,
    lastFrame: draft.lastFrame ? creationFileFromBase64(draft.lastFrame) : null,
  };
}

export async function creationFileInputs(files: CreationFiles) {
  const result: Partial<
    Record<CreationSlot, { name: string; mimeType: string; dataBase64: string }>
  > = {};
  for (const slot of CREATION_SLOTS) {
    const file = files[slot];
    if (file)
      result[slot] = { name: file.name, mimeType: file.type, dataBase64: await fileAsBase64(file) };
  }
  return result;
}
