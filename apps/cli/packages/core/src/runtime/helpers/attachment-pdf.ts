import { base64PayloadByteLength, isStrictBase64Payload } from "./attachment-data-url.js";

const DATA_URL_PREFIX = "data:";
const PDF_MEDIA_TYPE = "application/pdf";

export const PDF_INPUT_MAX_BYTES: number = 20 * 1024 * 1024;

export function parseInlinePdfDataUrl(dataUrl: string):
  | {
      mediaType: "application/pdf";
      sizeBytes: number;
      bytes: Buffer;
    }
  | undefined {
  const commaIndex = dataUrl.indexOf(",");
  if (dataUrl.slice(0, DATA_URL_PREFIX.length).toLowerCase() !== DATA_URL_PREFIX) {
    return undefined;
  }
  if (commaIndex < 0) {
    return undefined;
  }

  const headerParts = dataUrl.slice(DATA_URL_PREFIX.length, commaIndex).split(";");
  const mediaType = headerParts.shift()?.trim().toLowerCase();
  const payload = dataUrl.slice(commaIndex + 1);

  if (
    mediaType !== PDF_MEDIA_TYPE ||
    headerParts[headerParts.length - 1]?.trim().toLowerCase() !== "base64" ||
    !isStrictBase64Payload(payload)
  ) {
    return undefined;
  }

  const bytes = Buffer.from(payload, "base64");
  if (!isPdfBytes(bytes)) {
    return undefined;
  }

  return {
    mediaType: "application/pdf",
    sizeBytes: base64PayloadByteLength(payload),
    bytes,
  };
}

export function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}
