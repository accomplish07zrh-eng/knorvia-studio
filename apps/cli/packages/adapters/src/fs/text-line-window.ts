// SPDX-License-Identifier: Apache-2.0
// 流式行窗口：唯一状态所有者；未选中的行只记尾字符，内存不随其长度增长。
//
// 契约要点（B96/B99）：
// - `totalLines` 统计所有遇到的换行，`lines` 只保留被选中的行；
// - 选中判定是「已过的行数 ≥ offset」且「已收集行数 < limit」，offset 为 NaN 时按
//   「小于比较为 false」的冻结语义处理，不等价于「大于等于」；
// - 行尾 CRLF 只在「确实以换行收尾」时计入统计，文件最后一行的 `\r` 不改变结论。
export class TextLineWindow {
  readonly lines: string[] = [];
  totalLines = 0;
  private chunks: string[] = [];
  private tail = "";
  private crlfTally = 0;

  constructor(
    private readonly offset: number,
    private readonly limit: number | undefined,
  ) {}

  /** 本行是否进入 `lines`；与 `totalLines` 比较而不是与行下标比较。 */
  private keepsLine(): boolean {
    if (this.totalLines < this.offset) return false;
    if (this.limit === undefined) return true;
    return this.lines.length < this.limit;
  }

  /** 累积一段文本；只更新尾字符，未选中的行不占用内存。 */
  private take(text: string): void {
    if (text.length === 0) return;
    this.tail = text[text.length - 1]!;
    if (this.keepsLine()) this.chunks.push(text);
  }

  /** 结束当前行：先结算 CRLF，再按需落盘，最后清零本行状态。 */
  private endLine(sawNewline: boolean): void {
    const endsWithCr = this.tail === "\r";
    if (sawNewline) this.crlfTally += endsWithCr ? 1 : -1;
    if (this.keepsLine()) {
      const joined = this.chunks.join("");
      this.lines.push(endsWithCr ? joined.slice(0, -1) : joined);
    }
    this.totalLines += 1;
    this.chunks = [];
    this.tail = "";
  }

  /** 按 `\n` 切段：除最后一段外，每段后面都跟着一次换行。 */
  write(text: string): void {
    const segments = text.split("\n");
    const finalIndex = segments.length - 1;
    for (const [index, segment] of segments.entries()) {
      this.take(segment);
      if (index < finalIndex) this.endLine(true);
    }
  }

  /** 流结束时调用：先把解码器尾部并入当前行，再决定是否收尾。 */
  finish(decoderTail: string, sawBytes: boolean): void {
    this.take(decoderTail);
    if (sawBytes) this.endLine(false);
  }

  get lineEndings(): "CRLF" | "LF" {
    return this.crlfTally > 0 ? "CRLF" : "LF";
  }
}
