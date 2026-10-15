// SPDX-License-Identifier: Apache-2.0
// 流式行窗口：公开类只做转发，行选择与 CRLF 结算都在 LineSink 内部完成。
//
// 契约要点（B96/B99）：
// - `totalLines` 统计所有遇到的换行，`lines` 只保留被选中的行；
// - 选中判定是「已过的行数 ≥ offset」且「已收集行数 < limit」，offset 为 NaN 时按
//   「小于比较为 false」的冻结语义处理，不等价于「大于等于」；
// - 行尾 CRLF 只在「确实以换行收尾」时计入统计，文件最后一行的 `\r` 不改变结论；
// - 未选中的行只记录尾字符，因此内存占用与这些行的长度无关。
/** 行选择与 CRLF 结算的唯一实现：公开类只做转发，便于单独验证状态机。 */
class LineSink {
  readonly lines: string[] = [];
  totalLines = 0;
  private chunks: string[] = [];
  private tail = "";
  private crlfTally = 0;

  constructor(
    private readonly offset: number,
    private readonly limit: number | undefined,
  ) {}

  private keepsLine(): boolean {
    if (this.totalLines < this.offset) return false;
    if (this.limit === undefined) return true;
    return this.lines.length < this.limit;
  }

  private take(text: string): void {
    if (text.length === 0) return;
    this.tail = text[text.length - 1]!;
    if (this.keepsLine()) this.chunks.push(text);
  }

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

  /** 每次 write 的分段入口：段数 = 换行数 + 1，最后一段不带换行。 */
  push(text: string): void {
    const segments = text.split("\n");
    const finalIndex = segments.length - 1;
    for (const [index, segment] of segments.entries()) {
      this.take(segment);
      if (index < finalIndex) this.endLine(true);
    }
  }

  close(decoderTail: string, sawBytes: boolean): void {
    this.take(decoderTail);
    if (sawBytes) this.endLine(false);
  }

  get lineEndings(): "CRLF" | "LF" {
    return this.crlfTally > 0 ? "CRLF" : "LF";
  }
}

export class TextLineWindow {
  private readonly sink: LineSink;

  constructor(offset: number, limit: number | undefined) {
    this.sink = new LineSink(offset, limit);
  }

  get lines(): string[] {
    return this.sink.lines;
  }

  get totalLines(): number {
    return this.sink.totalLines;
  }

  write(text: string): void {
    this.sink.push(text);
  }

  finish(decoderTail: string, sawBytes: boolean): void {
    this.sink.close(decoderTail, sawBytes);
  }

  get lineEndings(): "CRLF" | "LF" {
    return this.sink.lineEndings;
  }
}
