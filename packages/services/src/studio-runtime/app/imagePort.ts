import type { StudioImageInput } from "../imageTypes.js";
/** 宿主解码端校验完整图片与哈希，不信任调用方的尺寸声明。 */
export interface StudioImageCodec {
  validate(input: StudioImageInput): void;
}

export function validateStudioTurnImages(
  codec: StudioImageCodec | undefined,
  kind: string,
  kernel: string,
  inputs?: StudioImageInput[],
): void {
  if (!inputs?.length) return;
  if (kind !== "chat" || kernel !== "codex" || !codec) throw new Error("此运行不支持图片输入");
  for (const image of inputs) codec.validate(image);
}
