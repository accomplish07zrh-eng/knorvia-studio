// SPDX-License-Identifier: Apache-2.0
// 流式行窗口：唯一状态所有者；未选中的行只记尾字符，内存不随其长度增长。
export class TextLineWindow {
  readonly lines: string[] = [];
  totalLines = 0;
  private pending: string[] = [];
  private tailChar = "";
  private crlfBalance = 0;

  constructor(
    private readonly offset: number,
    private readonly limit: number | undefined,
  ) {}

  /** 是否仍需要保留本行内容；offset 的 NaN 语义按冻结合同保留。 */
  private shouldKeep(): boolean {
    if (this.totalLines < this.offset) return false;
    if (this.limit === undefined) return true;
    return this.lines.length < this.limit;
  }

  private feed(text: string): void {
    if (text.length === 0) return;
    this.tailChar = text[text.length - 1]!;
    if (this.shouldKeep()) this.pending.push(text);
  }

  /** 收尾当前行：CRLF 只在「确实遇到换行」时计入统计。 */
  private closeLine(sawNewline: boolean): void {
    const endsWithCr = this.tailChar === "\r";
    if (sawNewline) this.crlfBalance += endsWithCr ? 1 : -1;
    if (this.shouldKeep()) {
      const joined = this.pending.join("");
      this.lines.push(endsWithCr ? joined.slice(0, -1) : joined);
    }
    this.totalLines += 1;
    this.pending = [];
    this.tailChar = "";
  }

  write(text: string): void {
    let start = 0;
    let newlineAt = text.indexOf("\n");
    while (newlineAt !== -1) {
      this.feed(text.slice(start, newlineAt));
      this.closeLine(true);
      start = newlineAt + 1;
      newlineAt = text.indexOf("\n", start);
    }
    this.feed(text.slice(start));
  }

  finish(decoderTail: string, sawBytes: boolean): void {
    this.feed(decoderTail);
    if (sawBytes) this.closeLine(false);
  }

  get lineEndings(): "CRLF" | "LF" {
    return this.crlfBalance > 0 ? "CRLF" : "LF";
  }
}
