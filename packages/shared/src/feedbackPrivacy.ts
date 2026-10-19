const REDACTION = "[REDACTED]";

const sensitiveName =
  /password|passwd|passphrase|secret|token|apikey|accesskey|privatekey|authorization|cookie|credential/i;
const diagnosticName =
  /^(?:content|messages?|prompt|systemprompt|request|response|body|payload|input|output|toolinput|tooloutput|arguments|args|env|environment|headers|text|completion|result|stdout|stderr|data|params)$/i;

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "");
}

function shouldRedactKey(key: string, diagnostic: boolean): boolean {
  const normalized = normalizeKey(key);
  return sensitiveName.test(normalized) || (diagnostic && diagnosticName.test(normalized));
}

function fieldKeys(text: string): Array<{ key: string; quoted: boolean; end: number }> {
  const fields: Array<{ key: string; quoted: boolean; end: number }> = [];
  const scanner = /(?:"((?:\\.|[^"\\])*)"|'([^']*)'|([\w.-]+))\s*[:=]\s*/g;
  for (const match of text.matchAll(scanner)) {
    let key = match[1] ?? match[2] ?? match[3] ?? "";
    if (match[1] !== undefined) {
      try {
        key = JSON.parse(`"${key}"`);
      } catch {
        // Keep the scanned spelling when a quoted key is not valid JSON.
      }
    }
    fields.push({ key, quoted: match[3] === undefined, end: match.index + match[0].length });
  }
  return fields;
}

function redactUrlPath(url: URL, diagnostic: boolean): boolean {
  if (diagnostic || url.username || url.password || url.hostname === "hooks.slack.com") {
    return true;
  }

  const queryNames = Array.from(url.searchParams.keys());
  if (
    queryNames.some(
      (key) => shouldRedactKey(key, false) || /^(?:.*signature|sig|code)$/i.test(normalizeKey(key)),
    )
  ) {
    return true;
  }

  try {
    return decodeURIComponent(url.pathname)
      .split("/")
      .some((segment) => {
        const normalized = normalizeKey(segment);
        return (
          sensitiveName.test(normalized) ||
          /^(?:webhook\w*|(?:password)?reset(?:password)?|invites?|invitations?|callback|downloads?|signed|verify|verification|activate|magiclink)$/i.test(
            normalized.toLowerCase(),
          )
        );
      });
  } catch {
    return true;
  }
}

function redactValues(text: string, diagnostic: boolean): string {
  let output = text.replace(
    /\b((?:Proxy-)?Authorization|Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi,
    (_match, name: string) => `${name}: ${REDACTION}`,
  );

  output = output.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
    REDACTION,
  );

  output = output.replace(/\bBearer\s+[^\s"'\\,;]+/gi, `Bearer ${REDACTION}`);

  output = output.replace(
    /([\w.-]+)(\s*[=:]\s*)("(?:\\.|[^"\\])*"|'[^']*'|[^\s,;"'<>]+)/g,
    (match, key: string, separator: string) =>
      shouldRedactKey(key, false) ? `${key}${separator}${REDACTION}` : match,
  );

  output = output.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>\\]+/gi, (raw) => {
    try {
      const url = new URL(raw);
      if (redactUrlPath(url, diagnostic) && url.pathname && url.pathname !== "/") {
        url.pathname = `/${REDACTION}`;
      }
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return REDACTION;
    }
  });

  output = output.replace(/(?:\/Users\/|\/home\/|[a-z]:\\Users\\)[^\s"'<>]+/gi, "[USER_PATH]");

  if (diagnostic) {
    output = output.replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, "[EMAIL]");
  }
  return output;
}

function scrubValue(value: unknown, diagnostic: boolean, depth = 0): unknown {
  if (depth > 32) return REDACTION;
  if (typeof value === "string") return redactText(value, diagnostic, depth + 1);
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, diagnostic, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        shouldRedactKey(key, diagnostic) ? REDACTION : scrubValue(item, diagnostic, depth + 1),
      ]),
    );
  }
  return value;
}

function redactPlainText(text: string, diagnostic: boolean): string {
  return redactValues(text, diagnostic)
    .split(/\r?\n/)
    .map((line) => {
      const unsafe = fieldKeys(line).some(
        ({ key, quoted, end }) =>
          shouldRedactKey(key, diagnostic) &&
          (quoted || diagnostic || !line.slice(end).startsWith(REDACTION)),
      );
      return unsafe ? REDACTION : line;
    })
    .join("\n");
}

function jsonFragmentEnd(text: string, start: number): number {
  let nesting = 0;
  let quoted = false;
  let escaped = false;
  for (let position = start; position < text.length; position += 1) {
    const character = text[position];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') {
      quoted = true;
    } else if (character === "{" || character === "[") {
      nesting += 1;
    } else if (character === "}" || character === "]") {
      nesting -= 1;
      if (nesting === 0) return position + 1;
    }
  }
  return text.length;
}

function redactText(text: string, diagnostic: boolean, depth: number): string {
  if (depth > 32) return REDACTION;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(scrubValue(parsed, diagnostic, depth + 1));
    }
  } catch {
    // A non-JSON input continues through the same mixed-text privacy policy.
  }

  const source = redactValues(text, diagnostic);
  const chunks: string[] = [];
  let cursor = 0;
  for (let position = 0; position < source.length; position += 1) {
    if (source.startsWith(REDACTION, position)) {
      position += REDACTION.length - 1;
      continue;
    }
    if (source[position] !== "{" && source[position] !== "[") continue;

    const prefix = source.slice(cursor, position);
    let end = jsonFragmentEnd(source, position);
    const linePrefix = prefix.slice(prefix.lastIndexOf("\n") + 1);
    const sensitiveValue = fieldKeys(linePrefix).some(({ key }) =>
      shouldRedactKey(key, diagnostic),
    );
    if (sensitiveValue) {
      const lineEnd = source.indexOf("\n", end);
      end = lineEnd < 0 ? source.length : lineEnd;
    }
    const fragment = source.slice(position, end);
    chunks.push(redactPlainText(prefix, diagnostic));
    try {
      chunks.push(
        sensitiveValue
          ? REDACTION
          : JSON.stringify(scrubValue(JSON.parse(fragment), diagnostic, depth + 1)),
      );
    } catch {
      const unsafe =
        sensitiveValue || fieldKeys(fragment).some(({ key }) => shouldRedactKey(key, diagnostic));
      chunks.push(unsafe ? REDACTION : redactPlainText(fragment, diagnostic));
    }
    cursor = end;
    position = end - 1;
  }
  chunks.push(redactPlainText(source.slice(cursor), diagnostic));
  return chunks.join("");
}

export function redactFeedbackText(text: string, options: { diagnostic?: boolean } = {}): string {
  return redactText(text, options.diagnostic === true, 0);
}
