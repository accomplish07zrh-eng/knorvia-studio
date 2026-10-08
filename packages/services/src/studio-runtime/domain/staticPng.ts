// IEEE CRC-32 的固定多项式；浏览器与 Host 共用纯字节校验，不依赖 MIME/扩展名识别动画。
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function chunkCrc(bytes: Uint8Array, start: number, end: number): number {
  let value = 0xffffffff;
  for (let index = start; index < end; index++)
    value = (value >>> 8) ^ crcTable[(value ^ bytes[index]!) & 255]!;
  return (value ^ 0xffffffff) >>> 0;
}

/** 静态 PNG 必须有完整且校验一致的数据块；完整像素解码仍由原能力端执行。 */
export function validateStaticPng(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8,
    hasData = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) throw new Error("PNG 数据块截断或长度损坏");
    const end = offset + 8 + length;
    const nameBytes = bytes.subarray(offset + 4, offset + 8);
    if (
      !nameBytes.every((value) => (value >= 65 && value <= 90) || (value >= 97 && value <= 122)) ||
      nameBytes[2]! & 32
    )
      throw new Error("PNG 数据块类型损坏");
    const name = String.fromCharCode(...nameBytes);
    if (chunkCrc(bytes, offset + 4, end) !== view.getUint32(end))
      throw new Error("PNG 数据块 CRC 损坏");
    // 修复：静态解码器忽略 APNG 声明会只发送首帧，与动画预览不一致；按真实 chunk 拒绝。
    if (["acTL", "fcTL", "fdAT"].includes(name))
      throw new Error("仅支持静态 PNG；APNG 动画图片不受支持 / Only static PNG is supported");
    if (name === "IHDR" && (offset !== 8 || length !== 13)) throw new Error("PNG 图片头重复或损坏");
    if (name === "IDAT") hasData = true;
    if (name === "IEND") {
      if (length !== 0 || !hasData || end + 4 !== bytes.length)
        throw new Error("PNG 结束数据块损坏");
      return;
    }
    offset = end + 4;
  }
  throw new Error("PNG 数据块截断或缺少结束标记");
}
