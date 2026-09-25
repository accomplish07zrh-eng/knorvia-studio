export type CreationSlot = "reference" | "firstFrame" | "lastFrame";
export type CreationFiles = Record<CreationSlot, File | null>;
export const CREATION_SLOTS: CreationSlot[] = ["reference", "firstFrame", "lastFrame"];
export const CREATION_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

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
    if (file && (file.size > 10 * 1024 * 1024 || !CREATION_IMAGE_TYPES.includes(file.type)))
      throw new Error("参考图只支持 10 MB 内的 PNG、JPEG 或 WebP");
  }
  if (files.reference && !slots?.image) throw new Error("当前模型未配置图生图输入");
  if (files.firstFrame && !slots?.firstFrame) throw new Error("当前模型未配置首帧输入");
  if (files.lastFrame && !slots?.lastFrame) throw new Error("当前模型未配置尾帧输入");
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
