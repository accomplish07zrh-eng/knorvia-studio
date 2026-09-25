const PLACEHOLDER = /(?<!\{)\{([A-Za-z_][A-Za-z0-9_]*)\}(?!\})/gu;
const INTENTIONALLY_EMPTY = new Set([
  "en-US:automations.form.schedule.minuteSuffix",
  "en-US:chat.empty.description.afterWorkspace",
]);

function placeholders(message) {
  return [...new Set([...message.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort();
}

/** Compare the effective runtime dictionaries, including their imported spreads. */
export function compareLocaleCatalogs(enUS, zhCN) {
  const errors = [];
  const keys = [...new Set([...Object.keys(enUS), ...Object.keys(zhCN)])].sort();
  for (const key of keys) {
    const inEnglish = Object.hasOwn(enUS, key);
    const inChinese = Object.hasOwn(zhCN, key);
    if (!inEnglish || !inChinese) {
      errors.push(`${key}: missing in ${inEnglish ? "zh-CN" : "en-US"}`);
      continue;
    }
    for (const [locale, message] of [
      ["en-US", enUS[key]],
      ["zh-CN", zhCN[key]],
    ]) {
      if (
        typeof message !== "string" ||
        (!message.trim() && !INTENTIONALLY_EMPTY.has(`${locale}:${key}`))
      ) {
        errors.push(`${key}: empty or non-string value in ${locale}`);
      }
    }
    if (typeof enUS[key] !== "string" || typeof zhCN[key] !== "string") continue;
    const enPlaceholders = placeholders(enUS[key]);
    const zhPlaceholders = placeholders(zhCN[key]);
    if (enPlaceholders.join("\0") !== zhPlaceholders.join("\0")) {
      errors.push(
        `${key}: placeholders differ (en-US: ${enPlaceholders.join(", ") || "none"}; zh-CN: ${zhPlaceholders.join(", ") || "none"})`,
      );
    }
  }
  return { keyCount: keys.length, errors };
}
