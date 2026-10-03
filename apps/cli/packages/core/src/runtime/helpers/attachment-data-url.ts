const DATA_URL_PREFIX = "data:";
const BASE64_GROUP_LENGTH = 4;
const BASE64_GROUP_BYTES = 3;
const UPPERCASE_START = 65;
const UPPERCASE_END = 90;
const LOWERCASE_START = 97;
const LOWERCASE_END = 122;
const DIGIT_START = 48;
const DIGIT_END = 57;
const PLUS_CODE = 43;
const SLASH_CODE = 47;
const PADDING_CODE = 61;

export function parseDataUrlHeader(dataUrl: string):
  | {
      mediaType: string;
    }
  | undefined {
  const commaPosition = dataUrl.indexOf(",");
  if (
    dataUrl.slice(0, DATA_URL_PREFIX.length).toLowerCase() !== DATA_URL_PREFIX ||
    commaPosition === -1
  ) {
    return undefined;
  }

  const mediaType = dataUrl.slice(DATA_URL_PREFIX.length, commaPosition).split(";", 1)[0]?.trim();
  if (!mediaType) {
    return undefined;
  }
  return { mediaType: mediaType.toLowerCase() };
}

export function base64PayloadByteLength(payload: string): number {
  const paddingLength = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * BASE64_GROUP_BYTES) / BASE64_GROUP_LENGTH) - paddingLength;
}

export function isStrictBase64Payload(payload: string): boolean {
  if (payload.length === 0) {
    return true;
  }
  if (payload.length % BASE64_GROUP_LENGTH !== 0) {
    return false;
  }

  const paddingLength = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const contentLength = payload.length - paddingLength;

  for (let position = 0; position < contentLength; position += 1) {
    const code = payload.charCodeAt(position);
    const accepted =
      (code >= UPPERCASE_START && code <= UPPERCASE_END) ||
      (code >= LOWERCASE_START && code <= LOWERCASE_END) ||
      (code >= DIGIT_START && code <= DIGIT_END) ||
      code === PLUS_CODE ||
      code === SLASH_CODE;
    if (!accepted) {
      return false;
    }
  }

  for (let position = contentLength; position < payload.length; position += 1) {
    if (payload.charCodeAt(position) !== PADDING_CODE) {
      return false;
    }
  }
  return true;
}
