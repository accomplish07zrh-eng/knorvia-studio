// SPDX-License-Identifier: Apache-2.0
/**
 * 反馈文本脱敏处理引擎。
 * 针对工单上报与诊断收集中的敏感信息（凭据、授权头、私钥、本地用户路径等）执行严格脱敏。
 */

const REDACTED_SENTINEL = "[REDACTED]";
const USER_PATH_SENTINEL = "[USER_PATH]";
const EMAIL_SENTINEL = "[EMAIL]";
const MAX_SCRUB_DEPTH = 32;

// 敏感字段匹配模式（严格脱敏）
const SENSITIVE_TOKEN_REGEX =
  /password|passwd|passphrase|secret|token|apikey|accesskey|privatekey|authorization|cookie|credential/i;

// 诊断模式敏感字段（当启用 diagnostic 时脱敏）
const DIAGNOSTIC_FIELD_REGEX =
  /^(?:content|messages?|prompt|systemprompt|request|response|body|payload|input|output|toolinput|tooloutput|arguments|args|env|environment|headers|text|completion|result|stdout|stderr|data|params)$/i;

// 特殊 URL 路径特征与签名参数
const SUSPICIOUS_PATH_SEGMENT_REGEX =
  /^(?:webhook\w*|(?:password)?reset(?:password)?|invites?|invitations?|callback|downloads?|signed|verify|verification|activate|magiclink)$/i;
const SIGNATURE_QUERY_REGEX = /^(?:.*signature|sig|code)$/i;

/** 清洗属性名提取纯字母数字 */
function stripKeyPunctuation(rawKey: string): string {
  return rawKey.replace(/[^a-zA-Z0-9]/g, "");
}

/** 判断字段名是否命中脱敏规则 */
function isKeyClassifiedSensitive(keyName: string, isDiagnostic: boolean): boolean {
  const clean = stripKeyPunctuation(keyName);
  if (SENSITIVE_TOKEN_REGEX.test(clean)) {
    return true;
  }
  return isDiagnostic && DIAGNOSTIC_FIELD_REGEX.test(clean);
}

/** 判定 URL 路径是否需要替换为 [REDACTED] */
function shouldScrubUrlPath(parsedUrl: URL, isDiagnostic: boolean): boolean {
  if (isDiagnostic || parsedUrl.username || parsedUrl.password) {
    return true;
  }
  if (parsedUrl.hostname === "hooks.slack.com") {
    return true;
  }
  for (const qKey of parsedUrl.searchParams.keys()) {
    const cleanQ = stripKeyPunctuation(qKey);
    if (SENSITIVE_TOKEN_REGEX.test(cleanQ) || SIGNATURE_QUERY_REGEX.test(cleanQ)) {
      return true;
    }
  }
  try {
    const segments = decodeURIComponent(parsedUrl.pathname).split("/");
    for (const part of segments) {
      const cleanPart = stripKeyPunctuation(part);
      if (
        SENSITIVE_TOKEN_REGEX.test(cleanPart) ||
        SUSPICIOUS_PATH_SEGMENT_REGEX.test(cleanPart.toLowerCase())
      ) {
        return true;
      }
    }
  } catch {
    return true;
  }
  return false;
}

/** 执行行级/文本级基线正则替换（授权头、密钥、Bearer、URL、路径） */
function performRegexScrubbing(content: string, isDiagnostic: boolean): string {
  let res = content;

  // 1. 协议头 Authorization / Cookie
  res = res.replace(
    /\b((?:Proxy-)?Authorization|Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi,
    (_matched, headerName: string) => `${headerName}: ${REDACTED_SENTINEL}`,
  );

  // 2. PEM 私钥块
  res = res.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
    REDACTED_SENTINEL,
  );

  // 3. Bearer 令牌
  res = res.replace(/\bBearer\s+[^\s"'\\,;]+/gi, `Bearer ${REDACTED_SENTINEL}`);

  // 4. 行内键值对 key: val 或 key=val
  res = res.replace(
    /([\w.-]+)(\s*[=:]\s*)("(?:\\.|[^"\\])*"|'[^']*'|[^\s,;"'<>]+)/g,
    (fullMatch, propKey: string, delimiter: string) => {
      return isKeyClassifiedSensitive(propKey, false)
        ? `${propKey}${delimiter}${REDACTED_SENTINEL}`
        : fullMatch;
    },
  );

  // 5. 绝对 URL 脱敏
  res = res.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>\\]+/gi, (matchedUrl) => {
    try {
      const parsed = new URL(matchedUrl);
      if (shouldScrubUrlPath(parsed, isDiagnostic) && parsed.pathname && parsed.pathname !== "/") {
        parsed.pathname = `/${REDACTED_SENTINEL}`;
      }
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return REDACTED_SENTINEL;
    }
  });

  // 6. 用户主目录与文件路径
  res = res.replace(/(?:\/Users\/|\/home\/|[a-zA-Z]:\\Users\\)[^\s"'<>]+/gi, USER_PATH_SENTINEL);

  // 7. 诊断模式下的邮箱地址
  if (isDiagnostic) {
    res = res.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi, EMAIL_SENTINEL);
  }

  return res;
}

/** 扫描单行文本中的键名及位置 */
function inspectLineKeyBindings(
  lineText: string,
): Array<{ key: string; quoted: boolean; end: number }> {
  const result: Array<{ key: string; quoted: boolean; end: number }> = [];
  const pattern = /(?:"((?:\\.|[^"\\])*)"|'([^']*)'|([\w.-]+))\s*[:=]\s*/g;
  for (const m of lineText.matchAll(pattern)) {
    let propName = m[1] ?? m[2] ?? m[3] ?? "";
    if (m[1] !== undefined) {
      try {
        propName = JSON.parse(`"${propName}"`);
      } catch {
        // 解码异常保留原样
      }
    }
    result.push({
      key: propName,
      quoted: m[3] === undefined,
      end: (m.index ?? 0) + m[0].length,
    });
  }
  return result;
}

/** 对普通文本进行逐行安全检查与整行脱敏 */
function filterPlainTextLines(plainText: string, isDiagnostic: boolean): string {
  const formatted = performRegexScrubbing(plainText, isDiagnostic);
  const rows = formatted.split(/\r?\n/);
  const sanitized = rows.map((row) => {
    const bindings = inspectLineKeyBindings(row);
    const hasUnsafeProperty = bindings.some(({ key, quoted, end }) => {
      if (!isKeyClassifiedSensitive(key, isDiagnostic)) {
        return false;
      }
      return quoted || isDiagnostic || !row.slice(end).startsWith(REDACTED_SENTINEL);
    });
    return hasUnsafeProperty ? REDACTED_SENTINEL : row;
  });
  return sanitized.join("\n");
}

/** 深度遍历并脱敏结构化对象 */
function recursivelySanitizeObject(data: unknown, isDiagnostic: boolean, depth: number): unknown {
  if (depth > MAX_SCRUB_DEPTH) {
    return REDACTED_SENTINEL;
  }
  if (typeof data === "string") {
    return transformTextPayload(data, isDiagnostic, depth + 1);
  }
  if (Array.isArray(data)) {
    return data.map((elem) => recursivelySanitizeObject(elem, isDiagnostic, depth + 1));
  }
  if (data !== null && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      if (isKeyClassifiedSensitive(k, isDiagnostic)) {
        cleaned[k] = REDACTED_SENTINEL;
      } else {
        cleaned[k] = recursivelySanitizeObject(v, isDiagnostic, depth + 1);
      }
    }
    return cleaned;
  }
  return data;
}

/** 探测内嵌 JSON 对象的结束边界 */
function locateJsonClosure(rawSource: string, openIndex: number): number {
  let stack = 0;
  let inString = false;
  let isEscaped = false;
  for (let idx = openIndex; idx < rawSource.length; idx += 1) {
    const ch = rawSource[idx];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === "\\") {
        isEscaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      stack += 1;
    } else if (ch === "}" || ch === "]") {
      stack -= 1;
      if (stack === 0) {
        return idx + 1;
      }
    }
  }
  return rawSource.length;
}

/** 综合调度文本与混合 JSON 的脱敏处理 */
function transformTextPayload(textInput: string, isDiagnostic: boolean, depth: number): string {
  if (depth > MAX_SCRUB_DEPTH) {
    return REDACTED_SENTINEL;
  }

  // 尝试顶层完整 JSON 解析
  try {
    const parsedJson: unknown = JSON.parse(textInput);
    if (parsedJson !== null && typeof parsedJson === "object") {
      const scrubbed = recursivelySanitizeObject(parsedJson, isDiagnostic, depth + 1);
      return JSON.stringify(scrubbed);
    }
  } catch {
    // 非纯 JSON 文本继续流转
  }

  const baseScrubbed = performRegexScrubbing(textInput, isDiagnostic);
  const fragments: string[] = [];
  let readHead = 0;

  for (let cursor = 0; cursor < baseScrubbed.length; cursor += 1) {
    if (baseScrubbed.startsWith(REDACTED_SENTINEL, cursor)) {
      cursor += REDACTED_SENTINEL.length - 1;
      continue;
    }
    const char = baseScrubbed[cursor];
    if (char !== "{" && char !== "[") {
      continue;
    }

    const leadSegment = baseScrubbed.slice(readHead, cursor);
    let closeIndex = locateJsonClosure(baseScrubbed, cursor);
    const lastNewline = leadSegment.lastIndexOf("\n");
    const currentLinePrefix = leadSegment.slice(lastNewline + 1);
    const isPrefixSensitive = inspectLineKeyBindings(currentLinePrefix).some(({ key }) =>
      isKeyClassifiedSensitive(key, isDiagnostic),
    );

    if (isPrefixSensitive) {
      const nextNewline = baseScrubbed.indexOf("\n", closeIndex);
      closeIndex = nextNewline < 0 ? baseScrubbed.length : nextNewline;
    }

    const embeddedSnippet = baseScrubbed.slice(cursor, closeIndex);
    fragments.push(filterPlainTextLines(leadSegment, isDiagnostic));

    try {
      if (isPrefixSensitive) {
        fragments.push(REDACTED_SENTINEL);
      } else {
        const parsed = JSON.parse(embeddedSnippet);
        const scrubbed = recursivelySanitizeObject(parsed, isDiagnostic, depth + 1);
        fragments.push(JSON.stringify(scrubbed));
      }
    } catch {
      const unsafe =
        isPrefixSensitive ||
        inspectLineKeyBindings(embeddedSnippet).some(({ key }) =>
          isKeyClassifiedSensitive(key, isDiagnostic),
        );
      fragments.push(
        unsafe ? REDACTED_SENTINEL : filterPlainTextLines(embeddedSnippet, isDiagnostic),
      );
    }

    readHead = closeIndex;
    cursor = closeIndex - 1;
  }

  fragments.push(filterPlainTextLines(baseScrubbed.slice(readHead), isDiagnostic));
  return fragments.join("");
}

/**
 * 反馈文本脱敏入口函数。
 * @param text 待处理文本或 JSON 字符串
 * @param options 脱敏配置项，可选 diagnostic 模式
 */
export function redactFeedbackText(text: string, options: { diagnostic?: boolean } = {}): string {
  return transformTextPayload(text, options.diagnostic === true, 0);
}
