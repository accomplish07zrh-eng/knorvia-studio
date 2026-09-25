import assert from "node:assert/strict";
import test from "node:test";
import { compareLocaleCatalogs } from "../../../scripts/i18n-parity.mjs";

test("locale parity accepts matching keys and reordered placeholders", () => {
  const result = compareLocaleCatalogs(
    { greeting: "Hello {name} in {place}" },
    { greeting: "在 {place} 你好，{name}！" },
  );
  assert.deepEqual(result, { keyCount: 1, errors: [] });
});

test("locale parity keeps documented empty fragments and treats double braces as literal syntax", () => {
  const result = compareLocaleCatalogs(
    {
      "automations.form.schedule.minuteSuffix": "",
      "chat.empty.description.afterWorkspace": "",
      hint: "Use {{nodeId}} and {count}",
    },
    {
      "automations.form.schedule.minuteSuffix": "分钟",
      "chat.empty.description.afterWorkspace": "项目新建任务",
      hint: "使用 {{节点ID}} 和 {count}",
    },
  );
  assert.deepEqual(result, { keyCount: 3, errors: [] });
});

test("locale parity reports missing translations, blank values and mismatched placeholders", () => {
  const result = compareLocaleCatalogs(
    { onlyEnglish: "English", blank: "Visible", greeting: "Hello {name}" },
    { onlyChinese: "中文", blank: "  ", greeting: "你好 {person}" },
  );
  assert.equal(result.keyCount, 4);
  assert.deepEqual(result.errors, [
    "blank: empty or non-string value in zh-CN",
    "greeting: placeholders differ (en-US: name; zh-CN: person)",
    "onlyChinese: missing in en-US",
    "onlyEnglish: missing in zh-CN",
  ]);
});
